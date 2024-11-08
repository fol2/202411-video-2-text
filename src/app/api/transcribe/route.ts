import { NextRequest, NextResponse } from 'next/server'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { readdir } from 'fs/promises'
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
          console.log('Setting up directories...')
          const { stdout: dirsOutput } = await execAsync(`python3 "${PYTHON_SCRIPT}" setup 2>/dev/null`)
          if (!dirsOutput) {
            throw new Error('Failed to get directory information')
          }
          const { input_dir, output_dir } = JSON.parse(dirsOutput.trim())
          console.log('Directories created:', { input_dir, output_dir })

          let audioPath: string

          if (file) {
            const buffer = await file.arrayBuffer()
            audioPath = join(input_dir, file.name)
            await writeFile(audioPath, Buffer.from(buffer))
          } else if (youtubeLink) {
            sendSSEMessage(encoder, controller, {
              type: 'status',
              message: 'Downloading YouTube video...'
            })

            console.log('Downloading YouTube video:', youtubeLink)
            const outputPath = join(input_dir, 'video.mp4')
            try {
              // First download the video
              const { stdout, stderr } = await execAsync(
                `python3 "${PYTHON_SCRIPT}" download "${outputPath}" "${youtubeLink}"`,
                { maxBuffer: 50 * 1024 * 1024 }
              )
              
              if (stderr) {
                console.log('Download stderr:', stderr)
              }

              const jsonStr = stdout.trim().split('\n').find(line => 
                line.trim().startsWith('{') && line.trim().endsWith('}')
              )

              if (!jsonStr) {
                throw new Error('No valid JSON response found in output')
              }

              const result = JSON.parse(jsonStr)
              if (!result.success || !result.file) {
                throw new Error('Invalid download response format')
              }

              audioPath = result.file
              console.log('Download successful, audio path:', audioPath)

              sendSSEMessage(encoder, controller, {
                type: 'status',
                message: 'Starting transcription...'
              })

              const pythonProcess = spawn('python3', [
                TRANSCRIBE_SCRIPT, 
                input_dir,
                language
              ])

              // Handle real-time stdout
              pythonProcess.stdout.on('data', (data) => {
                const output = data.toString()
                // Add token length check and truncate if needed
                const truncatedOutput = output.length > MAX_TOKEN_LENGTH 
                  ? output.slice(0, MAX_TOKEN_LENGTH) 
                  : output
                
                sendSSEMessage(encoder, controller, {
                  type: 'log',
                  message: truncatedOutput
                })
              })

              // Handle real-time stderr
              pythonProcess.stderr.on('data', (data) => {
                const error = data.toString()
                // Parse progress information
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

              // Handle process completion
              await new Promise((resolve, reject) => {
                pythonProcess.on('close', async (code) => {
                  if (code === 0) {
                    try {
                      const resultsDir = join(input_dir, 'v2clntxt_transcriptions', 'results_SC_pipeline')
                      const files = await readdir(resultsDir)
                      const transcriptionPath = join(resultsDir, files[0])
                      const transcription = await readFile(transcriptionPath, 'utf-8')

                      sendSSEMessage(encoder, controller, {
                        type: 'complete',
                        transcription
                      })
                      resolve(null)
                    } catch (error) {
                      reject(error)
                    }
                  } else {
                    reject(new Error(`Process exited with code ${code}`))
                  }
                })

                pythonProcess.on('error', reject)
              })
            } catch (error) {
              console.error('Download/transcription error:', error)
              throw error
            }
          }

          console.log('Checking if audio file exists at:', audioPath!)
          try {
            await readFile(audioPath!)
            console.log('Audio file exists and is readable')
          } catch (error) {
            console.error('Audio file check error:', error)
            throw new Error('Audio file not found or not accessible')
          }

          // Make the API call to Hugging Face
          const audioData = await readFile(audioPath!)
          const response = await fetch(process.env.HF_API_ENDPOINT!, {
            headers: {
              Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
              'Content-Type': 'audio/mpeg',
            },
            method: "POST",
            body: audioData,
          })

          if (!response.ok) {
            throw new Error(`Transcription failed: ${response.statusText}`)
          }

          const result = await response.json()
          
          // Clean up temp files
          await execAsync(`python3 -c "import shutil; shutil.rmtree('${input_dir}'); shutil.rmtree('${output_dir}')"`)
          
          sendSSEMessage(encoder, controller, {
            type: 'complete',
            transcription: result.text || result[0]?.text
          })

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