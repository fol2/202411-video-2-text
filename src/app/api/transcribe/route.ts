import { NextRequest, NextResponse } from 'next/server'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { readdir } from 'fs/promises'
import { headers } from 'next/headers'
import path from 'path'
import os from 'os'
import fs from 'fs'

export const runtime = 'nodejs'

const execAsync = promisify(exec)
const PYTHON_SCRIPT = join(process.cwd(), 'src', 'scripts', 'youtube_download.py')
const TRANSCRIBE_SCRIPT = join(process.cwd(), 'src', 'scripts', 'transcribe_script.py')

// Add max token length constant
const MAX_TOKEN_LENGTH = 448 // Whisper model's max target positions

// Add error type constants
const ERROR_TYPES = {
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  PYTHON_ENV_ERROR: 'PYTHON_ENV_ERROR',
  TRANSCRIPTION_ERROR: 'TRANSCRIPTION_ERROR'
} as const

// Add size limits
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

async function checkPythonEnvironment() {
  try {
    // Check for all required packages
    const { stdout } = await execAsync('pip3 list')
    const requiredPackages = ['yt-dlp', 'accelerate', 'transformers', 'torch', 'neuspell']
    const missingPackages = requiredPackages.filter(pkg => !stdout.includes(pkg))
    
    if (missingPackages.length > 0) {
      throw new Error(`Missing required packages: ${missingPackages.join(', ')}. Please install using: pip3 install ${missingPackages.join(' ')}`)
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

// Helper function to parse progress from stderr
function parseProgress(line: string): number | null {
  const match = line.match(/(\d+)%\|/)
  return match ? parseInt(match[1]) : null
}

// Update the parseYoutubeProgress function to include more details
function parseYoutubeProgress(line: string): { 
  progress: number; 
  speed: string; 
  eta: string;
  timeElapsed?: string;
} | null {
  const match = line.match(/PROGRESS:(\d+\.?\d*)\|([^|]+)\|(\d+:\d+)\|([^|]+)?/)
  if (match) {
    return {
      progress: parseFloat(match[1]),
      speed: match[2],
      eta: match[3],
      timeElapsed: match[4] || undefined
    }
  }
  return null
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder()

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          // Check Python environment first
          const isPythonReady = await checkPythonEnvironment()
          if (!isPythonReady) {
            sendSSEMessage(encoder, controller, {
              type: 'error',
              code: ERROR_TYPES.PYTHON_ENV_ERROR,
              message: 'Python environment is not properly set up'
            })
            controller.close()
            return
          }

          const formData = await request.formData()
          const uploadId = formData.get('uploadId') as string | null
          const youtubeLink = formData.get('youtubeLink') as string | null
          const language = formData.get('language') as string || 'auto'

          if (!uploadId && !youtubeLink) {
            sendSSEMessage(encoder, controller, {
              type: 'error',
              message: 'No upload ID or YouTube link provided'
            })
            controller.close()
            return
          }

          // Setup directories
          console.log('Setting up directories...')
          const tmpDir = uploadId 
            ? join(process.cwd(), 'temp_uploads', uploadId)
            : join(os.tmpdir(), `vid2cleantxt_${Date.now()}`)

          if (!uploadId) {
            fs.mkdirSync(tmpDir, { recursive: true })
          }

          let videoPath: string

          if (uploadId) {
            // Handle uploaded file transcription
            const files = await readdir(tmpDir)
            const videoFile = files.find(f => f.startsWith('video.'))
            if (!videoFile) {
              throw new Error('Video file not found in upload directory')
            }
            videoPath = join(tmpDir, videoFile)

            // Start transcription
            sendSSEMessage(encoder, controller, {
              type: 'status',
              message: 'Starting transcription...'
            })

            const transcriptionProcess = spawn('python3', [
              TRANSCRIBE_SCRIPT,
              tmpDir,
              language
            ], {
              stdio: ['pipe', 'pipe', 'pipe'],
              env: {
                ...process.env,
                PYTHONPATH: process.env.PYTHONPATH || '',
                TRANSFORMERS_CACHE: join(process.cwd(), '.cache', 'huggingface'),
                NEUSPELL_DATA: join(process.cwd(), '.cache', 'neuspell_data'),
                TORCH_HOME: join(process.cwd(), '.cache', 'torch'),
              }
            })

            let accumulatedJson = ''
            let isCollectingJson = false

            transcriptionProcess.stdout.on('data', (data) => {
              const output = data.toString()
              console.log('Transcribe stdout:', output)
              
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
                  sendSSEMessage(encoder, controller, {
                    type: 'error',
                    message: 'Failed to parse transcription result'
                  })
                }
                return
              }

              if (isCollectingJson && output.startsWith('CHUNK:')) {
                accumulatedJson += output.slice(6)
                return
              }

              // Send regular output as log message
              sendSSEMessage(encoder, controller, {
                type: 'log',
                message: output.trim()
              })
            })

            transcriptionProcess.stderr.on('data', (data) => {
              const error = data.toString()
              console.error('Transcribe stderr:', error)
              
              // Handle progress updates
              const progress = parseProgress(error)
              if (progress !== null) {
                sendSSEMessage(encoder, controller, {
                  type: 'progress',
                  progress,
                  message: error.trim()
                })
                return
              }
              
              // Handle other messages
              if (!error.includes('%|')) {
                sendSSEMessage(encoder, controller, {
                  type: 'log',
                  message: error.trim()
                })
              }
            })

            // Wait for transcription to complete
            await new Promise((resolve, reject) => {
              transcriptionProcess.on('close', (code) => {
                if (code === 0) {
                  resolve(null)
                } else {
                  reject(new Error(`Transcription process exited with code ${code}`))
                }
              })

              transcriptionProcess.on('error', (err) => {
                reject(new Error(`Failed to start transcription process: ${err.message}`))
              })
            })

            // Clean up temp files
            await execAsync(`python3 -c "import shutil; shutil.rmtree('${tmpDir}');"`)

            controller.close()
            return

          } else if (youtubeLink) {
            sendSSEMessage(encoder, controller, {
              type: 'status',
              message: 'Downloading YouTube video...'
            })

            console.log('Downloading YouTube video:', youtubeLink)
            const outputPath = join(tmpDir, 'video.mp4')
            
            try {
              // Add error handling for Python script execution
              const pythonProcess = spawn('python3', [
                PYTHON_SCRIPT,
                'download',
                outputPath,
                youtubeLink
              ], {
                stdio: ['pipe', 'pipe', 'pipe']
              })

              // Handle Python script output
              pythonProcess.stdout.on('data', (data) => {
                const output = data.toString()
                console.log('Python stdout:', output)
                sendSSEMessage(encoder, controller, {
                  type: 'log',
                  message: output
                })
              })

              // Update the stderr handler to log more information for debugging
              pythonProcess.stderr.on('data', (data) => {
                const lines = data.toString().split('\n')
                for (const line of lines) {
                  if (line.startsWith('PROGRESS:')) {
                    const progressData = parseYoutubeProgress(line)
                    if (progressData) {
                      sendSSEMessage(encoder, controller, {
                        type: 'progress',
                        progress: progressData.progress,
                        speed: progressData.speed,
                        eta: progressData.eta,
                        timeElapsed: progressData.timeElapsed,
                        message: `Downloading: ${progressData.progress.toFixed(1)}%`
                      })
                    }
                  } else if (line.includes('[transcribe]')) {
                    // Parse transcription progress with visual bar
                    const match = line.match(/Transcribe.*?(\d+)%\|([▏▎▍▌▋▊▉█ ]+)\|\s*(\d+)\/(\d+)\s+\[(\d+:\d+)<(\d+:\d+),\s+([\d.]+)s\/it\]/)
                    if (match) {
                      const [_, percent, bar, current, total, elapsed, eta, speed] = match
                      sendSSEMessage(encoder, controller, {
                        type: 'progress',
                        progress: parseFloat(percent),
                        currentStep: current,
                        totalSteps: total,
                        timeElapsed: elapsed,
                        eta: eta,
                        stepsPerSecond: `${parseFloat(speed).toFixed(2)} chunks/sec`,
                        message: 'Transcribing video...',
                        visualBar: bar.trim()
                      })
                    }
                  } else if (line.trim()) {
                    sendSSEMessage(encoder, controller, {
                      type: 'log',
                      message: line.trim()
                    })
                  }
                }
              })

              // Wait for download to complete
              const downloadResult = await new Promise((resolve, reject) => {
                pythonProcess.on('close', (code) => {
                  if (code === 0) {
                    resolve(outputPath)
                  } else {
                    reject(new Error(`Download process exited with code ${code}`))
                  }
                })

                pythonProcess.on('error', (err) => {
                  reject(new Error(`Failed to start download process: ${err.message}`))
                })
              })

              videoPath = downloadResult as string

              // Start transcription with language parameter
              sendSSEMessage(encoder, controller, {
                type: 'status',
                message: 'Starting transcription...'
              })

              const transcriptionProcess = spawn('python3', [
                TRANSCRIBE_SCRIPT,
                tmpDir,
                language
              ], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: {
                  ...process.env,
                  PYTHONPATH: process.env.PYTHONPATH || '',
                  TRANSFORMERS_CACHE: join(process.cwd(), '.cache', 'huggingface'),
                  NEUSPELL_DATA: join(process.cwd(), '.cache', 'neuspell_data'),
                  TORCH_HOME: join(process.cwd(), '.cache', 'torch'),
                }
              })

              let accumulatedJson = ''
              let isCollectingJson = false

              transcriptionProcess.stdout.on('data', (data) => {
                const output = data.toString()
                console.log('Transcribe stdout:', output)
                
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
                    sendSSEMessage(encoder, controller, {
                      type: 'error',
                      message: 'Failed to parse transcription result'
                    })
                  }
                  return
                }

                if (isCollectingJson && output.startsWith('CHUNK:')) {
                  accumulatedJson += output.slice(6)
                  return
                }

                // Send regular output as log message
                sendSSEMessage(encoder, controller, {
                  type: 'log',
                  message: output.trim()
                })
              })

              transcriptionProcess.stderr.on('data', (data) => {
                const error = data.toString()
                console.error('Transcribe stderr:', error)
                
                // Handle progress updates
                const progress = parseProgress(error)
                if (progress !== null) {
                  sendSSEMessage(encoder, controller, {
                    type: 'progress',
                    progress,
                    message: error.trim()
                  })
                  return
                }
                
                // Handle other messages
                if (!error.includes('%|')) {
                  sendSSEMessage(encoder, controller, {
                    type: 'log',
                    message: error.trim()
                  })
                }
              })

              // Wait for transcription to complete
              await new Promise((resolve, reject) => {
                transcriptionProcess.on('close', (code) => {
                  if (code === 0) {
                    resolve(null)
                  } else {
                    reject(new Error(`Transcription process exited with code ${code}`))
                  }
                })

                transcriptionProcess.on('error', (err) => {
                  reject(new Error(`Failed to start transcription process: ${err.message}`))
                })
              })

            } catch (error) {
              console.error('Process error:', error)
              const errorMessage = error instanceof Error ? error.message : 'Unknown process error'
              
              // Handle specific error types
              if (errorMessage.includes('Payload Too Large')) {
                sendSSEMessage(encoder, controller, {
                  type: 'error',
                  code: ERROR_TYPES.PAYLOAD_TOO_LARGE,
                  message: 'File size too large for processing'
                })
              } else {
                sendSSEMessage(encoder, controller, {
                  type: 'error',
                  code: ERROR_TYPES.TRANSCRIPTION_ERROR,
                  message: errorMessage
                })
              }
              controller.close()
              return
            }
          }

          console.log('Checking if video file exists at:', videoPath!)
          try {
            await readFile(videoPath!)
            console.log('Video file exists and is readable')
          } catch (error) {
            console.error('Video file check error:', error)
            throw new Error('Video file not found or not accessible')
          }

          // Clean up temp files
          await execAsync(`python3 -c "import shutil; shutil.rmtree('${tmpDir}'); shutil.rmtree('${tmpDir}')"`)
          
          sendSSEMessage(encoder, controller, {
            type: 'complete',
            transcription: result.text || result[0]?.text
          })

          controller.close()
        } catch (error) {
          console.error('Error during transcription:', error)
          sendSSEMessage(encoder, controller, {
            type: 'error',
            message: error instanceof Error ? error.message : 'Unknown error occurred'
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