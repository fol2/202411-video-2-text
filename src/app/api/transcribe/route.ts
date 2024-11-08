import { NextRequest, NextResponse } from 'next/server'
import { spawn, exec } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { readFile, writeFile, readdir } from 'fs/promises'
import { headers } from 'next/headers'

export const runtime = 'nodejs'

const execAsync = promisify(exec)
const PYTHON_SCRIPT = join(process.cwd(), 'src', 'scripts', 'youtube_download.py')
const TRANSCRIBE_SCRIPT = join(process.cwd(), 'src', 'scripts', 'transcribe_script.py')

// Add max token length constant
const MAX_TOKEN_LENGTH = 448 // Whisper model's max target positions

async function checkPythonEnvironment() {
  try {
    const { stdout } = await execAsync('pip3 list')
    if (!stdout.includes('yt-dlp')) {
      throw new Error('yt-dlp not found')
    }
    return true
  } catch (error) {
    console.error('Python environment check failed:', error)
    return false
  }
}

function parseLogOutput(line: string): { type: string; level?: string; message?: string; progress?: number } | null {
  try {
    if (line.startsWith('LOG_OUTPUT:')) {
      const logData = JSON.parse(line.slice('LOG_OUTPUT:'.length))
      return {
        type: 'LOG',
        level: logData.level,
        message: logData.message
      }
    } else if (line.startsWith('PROGRESS_OUTPUT:')) {
      const progressData = JSON.parse(line.slice('PROGRESS_OUTPUT:'.length))
      return {
        type: 'PROGRESS',
        progress: progressData.progress,
        message: progressData.description
      }
    }
  } catch (e) {
    // If we can't parse the line, just return it as a regular log
    return {
      type: 'LOG',
      level: 'info',
      message: line
    }
  }
  return null
}

// Helper function to send SSE messages
function sendSSEMessage(encoder: TextEncoder, controller: ReadableStreamDefaultController, data: any) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder()
  
  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          const isPythonReady = await checkPythonEnvironment()
          if (!isPythonReady) {
            sendSSEMessage(encoder, controller, {
              type: 'error',
              message: 'Python environment is not properly set up. Please install yt-dlp using: pip3 install yt-dlp'
            })
            controller.close()
            return
          }

          const formData = await request.formData()
          const file = formData.get('file') as File | null
          const youtubeLink = formData.get('youtubeLink') as string | null
          const language = formData.get('language') as string || 'auto'

          if (!file && !youtubeLink) {
            sendSSEMessage(encoder, controller, {
              type: 'error',
              message: 'No file or YouTube link provided'
            })
            controller.close()
            return
          }

          // Setup directories using Python script
          const { stdout: dirsOutput } = await execAsync(`python3 "${PYTHON_SCRIPT}" setup 2>/dev/null`)
          if (!dirsOutput) {
            throw new Error('Failed to get directory information')
          }
          const { input_dir, output_dir } = JSON.parse(dirsOutput.trim())

          if (file) {
            const buffer = await file.arrayBuffer()
            const audioPath = join(input_dir, file.name)
            await writeFile(audioPath, Buffer.from(buffer))
          } else if (youtubeLink) {
            sendSSEMessage(encoder, controller, {
              type: 'status',
              message: 'Downloading YouTube video...'
            })

            const outputPath = join(input_dir, 'video.mp4')
            const { stdout, stderr } = await execAsync(
              `python3 "${PYTHON_SCRIPT}" download "${outputPath}" "${youtubeLink}"`,
              { maxBuffer: 50 * 1024 * 1024 }
            )
            
            if (stderr) {
              console.log('Download stderr:', stderr)
            }
          }

          // Start transcription process
          sendSSEMessage(encoder, controller, {
            type: 'status',
            message: 'Starting transcription...'
          })

          const pythonProcess = spawn('python3', [
            TRANSCRIBE_SCRIPT, 
            input_dir,
            language
          ])

          let accumulatedJson = ''
          let isCollectingJson = false

          // Handle real-time stdout
          pythonProcess.stdout.on('data', (data) => {
            const output = data.toString()
            
            if (output.includes('JSON_OUTPUT_START')) {
              isCollectingJson = true
              return
            }
            
            if (output.includes('JSON_OUTPUT_END')) {
              isCollectingJson = false
              try {
                const result = JSON.parse(accumulatedJson)
                sendSSEMessage(encoder, controller, {
                  type: 'complete',
                  transcription: result
                })
              } catch (e) {
                console.error('JSON parse error:', e)
              }
              return
            }

            if (isCollectingJson && output.startsWith('CHUNK:')) {
              accumulatedJson += output.slice(6)
              return
            }

            sendSSEMessage(encoder, controller, {
              type: 'log', 
              message: output
            })
          })

          pythonProcess.stderr.on('data', (data) => {
            const error = data.toString()
            if (error.includes('%|')) {
              const progressMatch = error.match(/(\d+)%\|/)
              if (progressMatch) {
                sendSSEMessage(encoder, controller, {
                  type: 'progress',
                  progress: parseInt(progressMatch[1])
                })
              }
            }
            sendSSEMessage(encoder, controller, {
              type: 'log',
              message: error
            })
          })

          await new Promise((resolve, reject) => {
            pythonProcess.on('close', async (code) => {
              if (code === 0) {
                resolve(null)
              } else {
                reject(new Error(`Process exited with code ${code}`))
              }
            })
            pythonProcess.on('error', reject)
          })

          // Clean up temp files
          await execAsync(`python3 -c "import shutil; shutil.rmtree('${input_dir}'); shutil.rmtree('${output_dir}')"`)
          
          controller.close()
        } catch (error) {
          sendSSEMessage(encoder, controller, {
            type: 'error',
            message: error instanceof Error ? error.message : 'Unknown error'
          })
          controller.close()
        }
      }
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    }
  )
}