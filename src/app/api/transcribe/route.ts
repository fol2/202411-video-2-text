import { NextRequest, NextResponse } from 'next/server'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
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

// Add logger configuration at the top with other imports
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogMessage {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: any;
}

const logger = {
  debug: (message: string, data?: any) => log('debug', message, data),
  info: (message: string, data?: any) => log('info', message, data),
  warn: (message: string, data?: any) => log('warn', message, data),
  error: (message: string, data?: any) => log('error', message, data)
};

function log(level: LogLevel, message: string, data?: any) {
  const isProduction = process.env.NODE_ENV === 'production';
  const timestamp = new Date().toISOString();
  
  const logMessage: LogMessage = {
    level,
    message,
    timestamp,
    ...(data && { data })
  };

  // In production, only log info and above
  if (isProduction && level === 'debug') return;

  // Format the log message
  const formattedMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  
  switch (level) {
    case 'debug':
      console.debug(formattedMessage, data || '');
      break;
    case 'info':
      console.info(formattedMessage, data || '');
      break;
    case 'warn':
      console.warn(formattedMessage, data || '');
      break;
    case 'error':
      console.error(formattedMessage, data || '');
      break;
  }
}

async function checkPythonEnvironment() {
  try {
    // Check for all required packages
    const { stdout } = await execAsync('pip3 list')
    const requiredPackages = ['yt-dlp', 'accelerate', 'transformers', 'torch', 'neuspell']
    const missingPackages = requiredPackages.filter(pkg => !stdout.includes(pkg))
    
    if (missingPackages.length > 0) {
      throw new Error(`Missing required packages: ${missingPackages.join(', ')}`)
    }
    
    return true
  } catch (error) {
    logger.error('Python environment check failed:', { error })
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

// Add type definitions for SSE messages
type SSEMessageType = 'progress' | 'status' | 'log' | 'error' | 'complete';

interface BaseSSEMessage {
  type: SSEMessageType;
  message: string;
  timestamp?: string;
}

interface ProgressSSEMessage extends BaseSSEMessage {
  type: 'progress';
  progress: number;
  speed?: string;
  eta?: string;
  currentStep?: string;
  totalSteps?: string;
  visualBar?: string;
}

interface ErrorSSEMessage extends BaseSSEMessage {
  type: 'error';
  code: keyof typeof ERROR_TYPES;
  details?: Record<string, unknown>;
}

interface CompleteSSEMessage extends BaseSSEMessage {
  type: 'complete';
  transcription: string;
  metadata?: {
    language?: string;
    confidence?: number;
    duration?: number;
  };
}

type SSEMessage = BaseSSEMessage | ProgressSSEMessage | ErrorSSEMessage | CompleteSSEMessage;

// Update the sendSSEMessage function to handle message types
function sendSSEMessage(
  encoder: TextEncoder,
  controller: ReadableStreamDefaultController,
  message: SSEMessage
) {
  const timestamp = new Date().toISOString();
  const data = {
    ...message,
    timestamp,
  };

  try {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  } catch (error) {
    logger.error('Failed to send SSE message:', { error, message });
    // Attempt to send error message if possible
    try {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'error',
            message: 'Failed to send message',
            timestamp,
          })}\n\n`
        )
      );
    } catch {
      // If we can't send any messages, just log the error
      logger.error('Failed to send error message through SSE');
    }
  }
}

// Add connection cleanup helper
function cleanupSSEConnection(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder
) {
  try {
    // Send final message before closing
    sendSSEMessage(encoder, controller, {
      type: 'status',
      message: 'Connection closing',
    });
    controller.close();
  } catch (error) {
    logger.error('Error during SSE connection cleanup:', { error });
  }
}

// Helper function to parse progress from stderr
function parseProgress(line: string): number | null {
  const match = line.match(/(\d+)%\|/)
  return match ? parseInt(match[1]) : null
}

// Update the parseYoutubeProgress function to handle more formats
function parseYoutubeProgress(line: string): { 
  progress: number; 
  speed?: string; 
  eta?: string;
  timeElapsed?: string;
  size?: string;
} | null {
  // Handle different progress line formats
  
  // Format 1: [download] 23.4% of 50.23MiB at 2.35MiB/s ETA 00:15
  const downloadMatch = line.match(
    /\[download\]\s+(\d+\.?\d*)%\s+of\s+([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+(\d+:\d+)/
  )
  if (downloadMatch) {
    return {
      progress: parseFloat(downloadMatch[1]),
      size: downloadMatch[2],
      speed: downloadMatch[3],
      eta: downloadMatch[4]
    }
  }

  // Format 2: PROGRESS:45.5|2.5MiB/s|01:30|02:15
  const progressMatch = line.match(
    /PROGRESS:(\d+\.?\d*)\|([^|]+)\|([^|]+)(?:\|([^|]+))?/
  )
  if (progressMatch) {
    return {
      progress: parseFloat(progressMatch[1]),
      speed: progressMatch[2],
      eta: progressMatch[3],
      timeElapsed: progressMatch[4]
    }
  }

  // Format 3: [ffmpeg] 67.5% done
  const ffmpegMatch = line.match(/\[ffmpeg\]\s+(\d+\.?\d*)%\s+done/)
  if (ffmpegMatch) {
    return {
      progress: parseFloat(ffmpegMatch[1])
    }
  }

  return null
}

// Add this helper function
async function readTranscriptionFile(outputDir: string): Promise<string> {
  const files = await readdir(outputDir)
  const transcriptionFile = files.find(f => f.endsWith('.txt'))
  if (!transcriptionFile) {
    throw new Error('Transcription file not found')
  }
  return await readFile(join(outputDir, transcriptionFile), 'utf-8')
}

async function ensureCacheDirectories(): Promise<void> {
  const cacheDirectories = [
    ['.cache', 'huggingface'],
    ['.cache', 'neuspell_data'],
    ['.cache', 'torch']
  ]

  try {
    for (const pathSegments of cacheDirectories) {
      const cachePath = join(process.cwd(), ...pathSegments)
      await mkdir(cachePath, { recursive: true })
      
      // Verify write permissions by attempting to create a test file
      const testFile = join(cachePath, '.write-test')
      try {
        await writeFile(testFile, '')
        await fs.promises.unlink(testFile)
      } catch (error) {
        throw new Error(`Cache directory ${cachePath} is not writable: ${error.message}`)
      }
    }
  } catch (error) {
    console.error('Failed to setup cache directories:', error)
    throw new Error(`Cache directory setup failed: ${error.message}`)
  }
}

const getTranscriptionProcessConfig = () => ({
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    PYTHONPATH: process.env.PYTHONPATH || '',
    TRANSFORMERS_CACHE: join(process.cwd(), '.cache', 'huggingface'),
    NEUSPELL_DATA: join(process.cwd(), '.cache', 'neuspell_data'),
    TORCH_HOME: join(process.cwd(), '.cache', 'torch'),
    // Add any additional environment variables here
  }
})

// Add type for process events
type ProcessEvents = {
  onData?: (data: Buffer) => void;
  onError?: (data: Buffer) => void;
  onClose?: (code: number | null) => void;
}

// Add helper function to handle process events
async function handleProcessEvents(
  process: ReturnType<typeof spawn>,
  events: ProcessEvents
): Promise<void> {
  return new Promise((resolve, reject) => {
    let errorOutput = '';

    if (events.onData) {
      process.stdout?.on('data', events.onData);
    }

    if (events.onError) {
      process.stderr?.on('data', (data: Buffer) => {
        errorOutput += data.toString();
        events.onError?.(data);
      });
    }

    process.on('close', (code: number | null) => {
      events.onClose?.(code);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Process exited with code ${code}\n${errorOutput}`));
      }
    });

    process.on('error', (err: Error) => {
      reject(new Error(`Failed to start process: ${err.message}`));
    });
  });
}

// Add helper function to safely clean up directory
async function cleanupDirectory(dir: string): Promise<void> {
  try {
    await execAsync(`python3 -c "import shutil; shutil.rmtree('${dir}')"`)
  } catch (error) {
    console.error(`Failed to clean up directory ${dir}:`, error)
    // Don't throw - cleanup errors shouldn't stop the process
  }
}

// Add helper function to list directory contents
async function logDirectoryContents(dir: string, logger: any) {
  try {
    const files = await readdir(dir, { withFileTypes: true });
    const contents = await Promise.all(
      files.map(async (dirent) => {
        const fullPath = join(dir, dirent.name);
        if (dirent.isDirectory()) {
          const subContents = await logDirectoryContents(fullPath, logger);
          return `${dirent.name}/\n${subContents.map(s => `  ${s}`).join('\n')}`;
        }
        return dirent.name;
      })
    );
    logger.debug('Directory contents:', { dir, contents });
    return contents;
  } catch (error) {
    logger.error('Failed to read directory:', { dir, error });
    return [];
  }
}

// Update handleTranscriptionProcess function
async function handleTranscriptionProcess(
  process: ReturnType<typeof spawn>,
  encoder: TextEncoder,
  controller: ReadableStreamDefaultController
): Promise<string> {
  let accumulatedJson = '';
  let isCollectingJson = false;
  let transcriptionResult: string | null = null;

  await handleProcessEvents(process, {
    onData: (data: Buffer) => {
      const output = data.toString();
      logger.debug('Transcribe stdout:', { output });

      // Split output into lines to handle multiple lines in a single 'data' event
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('JSON_OUTPUT_START')) {
          isCollectingJson = true;
          accumulatedJson = ''; // Reset accumulated JSON
          continue;
        }

        if (line.includes('JSON_OUTPUT_END')) {
          isCollectingJson = false;

          // Strip 'CHUNK:' prefix if present
          const jsonString = accumulatedJson.startsWith('CHUNK:')
            ? accumulatedJson.slice('CHUNK:'.length)
            : accumulatedJson;

          try {
            const result = JSON.parse(jsonString);
            logger.debug('Parsed JSON result:', { result });
            transcriptionResult = result.text_output_dir;
            logger.debug('Set transcription result:', { transcriptionResult });
          } catch (e) {
            logger.error('JSON parse error:', { error: e, accumulatedJson });
            throw new Error('Failed to parse transcription result');
          }
          continue;
        }

        if (isCollectingJson) {
          // Accumulate JSON content line by line
          accumulatedJson += line.trim();
          continue;
        }

        // Handle regular log messages
        if (line.trim()) {
          sendSSEMessage(encoder, controller, {
            type: 'log',
            message: line.trim(),
          });
        }
      }
    },
    onError: (data: Buffer) => {
      const error = data.toString();
      logger.debug('Transcribe stderr:', { error });
      
      const progress = parseProgress(error);
      
      if (progress !== null) {
        sendSSEMessage(encoder, controller, {
          type: 'progress',
          progress,
          message: error.trim()
        });
      } else if (!error.includes('%|')) {
        sendSSEMessage(encoder, controller, {
          type: 'log',
          message: error.trim()
        });
      }
    }
  });

  if (!transcriptionResult) {
    logger.error('No transcription result received after process completion');
    throw new Error('No transcription result received');
  }

  // Log directory contents after transcription
  await logDirectoryContents(transcriptionResult, logger);

  return transcriptionResult;
}

// Add helper function for file size validation
async function validateFileSize(filePath: string): Promise<void> {
  try {
    const stats = await fs.promises.stat(filePath)
    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(`File size (${(stats.size / 1024 / 1024).toFixed(1)}MB) exceeds maximum allowed size (${MAX_FILE_SIZE / 1024 / 1024}MB)`)
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`File size validation failed: ${error.message}`)
    }
    throw error
  }
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  let tmpDir: string | null = null;

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          await ensureCacheDirectories();
          
          const isPythonReady = await checkPythonEnvironment();
          if (!isPythonReady) {
            throw new Error('Python environment is not properly set up');
          }

          const formData = await request.formData();
          const uploadId = formData.get('uploadId') as string | null;
          const youtubeLink = formData.get('youtubeLink') as string | null;
          const language = formData.get('language') as string || 'auto';

          if (!uploadId && !youtubeLink) {
            throw new Error('No upload ID or YouTube link provided');
          }

          // Unified tmpDir handling
          if (uploadId) {
            tmpDir = join(process.cwd(), 'temp_uploads', uploadId);
          } else {
            const uniqueId = `youtube_${Date.now()}`;
            tmpDir = join(process.cwd(), 'temp_uploads', uniqueId);
          }
          await mkdir(tmpDir, { recursive: true });

          let videoPath: string;

          if (uploadId) {
            // Handle uploaded file transcription
            const files = await readdir(tmpDir)
            const videoFile = files.find(f => f.startsWith('video.'))
            if (!videoFile) {
              throw new Error('Video file not found in upload directory')
            }
            videoPath = join(tmpDir, videoFile)

            // Add file size validation
            try {
              await validateFileSize(videoPath)
            } catch (error) {
              sendSSEMessage(encoder, controller, {
                type: 'error',
                code: ERROR_TYPES.PAYLOAD_TOO_LARGE,
                message: error instanceof Error ? error.message : 'File size validation failed'
              })
              return
            }

            // Start transcription
            sendSSEMessage(encoder, controller, {
              type: 'status',
              message: 'Starting transcription...'
            })

            const transcriptionProcess = spawn(
              'python3',
              [TRANSCRIBE_SCRIPT, tmpDir, language],
              getTranscriptionProcessConfig()
            );

            logger.debug('Starting transcription process:', { 
              script: TRANSCRIBE_SCRIPT,
              tmpDir,
              language 
            });

            // Log initial directory contents
            await logDirectoryContents(tmpDir, logger);

            const transcriptionResult = await handleTranscriptionProcess(
              transcriptionProcess, 
              encoder, 
              controller
            );

            logger.debug('Transcription completed:', { 
              result: transcriptionResult 
            });

            // Log final directory contents
            await logDirectoryContents(transcriptionResult, logger);

            // Read the transcription text
            try {
              const transcriptionText = await readTranscriptionFile(transcriptionResult);
              logger.debug('Read transcription text:', { 
                length: transcriptionText.length 
              });

              sendSSEMessage(encoder, controller, {
                type: 'complete',
                message: 'Transcription completed successfully',
                transcription: transcriptionText
              });
            } catch (error) {
              logger.error('Failed to read transcription file:', { error });
              throw error;
            }

            // Clean up temp files
            await cleanupDirectory(tmpDir);
            controller.close();
            return;

          } else if (youtubeLink) {
            logger.info('Starting YouTube video download:', { youtubeLink });
            
            sendSSEMessage(encoder, controller, {
              type: 'status',
              message: 'Downloading YouTube video...'
            })

            console.log('Downloading YouTube video:', youtubeLink)
            const outputPath = join(tmpDir, 'video.mp4')
            videoPath = outputPath;

            try {
              // Add error handling for Python script execution
              const pythonProcess = spawn('python3', [
                PYTHON_SCRIPT,
                'download',
                outputPath,
                youtubeLink,
                `--max-filesize=${MAX_FILE_SIZE}` // Add max filesize parameter
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

              // Update the stderr handler to use the improved progress parsing
              pythonProcess.stderr.on('data', (data) => {
                const lines = data.toString().split('\n')
                for (const line of lines) {
                  if (!line.trim()) continue

                  const progressData = parseYoutubeProgress(line)
                  if (progressData) {
                    sendSSEMessage(encoder, controller, {
                      type: 'progress',
                      ...progressData,
                      message: `Downloading: ${progressData.progress.toFixed(1)}%${
                        progressData.speed ? ` at ${progressData.speed}` : ''
                      }${
                        progressData.eta ? ` (ETA: ${progressData.eta})` : ''
                      }`
                    })
                    continue
                  }

                  // Handle transcription progress (existing code)
                  if (line.includes('[transcribe]')) {
                    const match = line.match(
                      /Transcribe.*?(\d+)%\|([▏▎▍▌▋▊▉█ ]+)\|\s*(\d+)\/(\d+)\s+\[(\d+:\d+)<(\d+:\d+),\s+([\d.]+)s\/it\]/
                    )
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
                      continue
                    }
                  }

                  // Log any other messages
                  if (line.trim()) {
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

              // Validate downloaded file size
              try {
                await validateFileSize(outputPath)
              } catch (error) {
                sendSSEMessage(encoder, controller, {
                  type: 'error',
                  code: ERROR_TYPES.PAYLOAD_TOO_LARGE,
                  message: error instanceof Error ? error.message : 'Downloaded file exceeds size limit'
                })
                return
              }

              // Start transcription with language parameter
              sendSSEMessage(encoder, controller, {
                type: 'status',
                message: 'Starting transcription...'
              })

              const transcriptionProcess = spawn(
                'python3',
                [TRANSCRIBE_SCRIPT, tmpDir, language],
                getTranscriptionProcessConfig()
              )

              // Get transcription result directory
              const transcriptionResult = await handleTranscriptionProcess(transcriptionProcess, encoder, controller);

              // Read the transcription text
              try {
                const transcriptionText = await readTranscriptionFile(transcriptionResult);
                logger.debug('Read transcription text:', { 
                  length: transcriptionText.length 
                });

                sendSSEMessage(encoder, controller, {
                  type: 'complete',
                  message: 'Transcription completed successfully',
                  transcription: transcriptionText
                });

                // Clean up temp files
                await cleanupDirectory(tmpDir);
                controller.close();
                return;
              } catch (error) {
                logger.error('Failed to read transcription file:', { error });
                throw error;
              }

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

          logger.debug('Checking video file:', { path: videoPath });
          try {
            await readFile(videoPath!)
            logger.info('Video file validated successfully');
          } catch (error) {
            logger.error('Video file validation failed:', { error });
            throw new Error('Video file not found or not accessible');
          }

          // Clean up temp files (remove duplicate rmtree call)
          await execAsync(`python3 -c "import shutil; shutil.rmtree('${tmpDir}')"`)
          
          sendSSEMessage(encoder, controller, {
            type: 'complete',
            transcription: transcriptionResult.text || transcriptionResult[0]?.text
          })

          controller.close()
        } catch (error) {
          logger.error('Transcription process failed:', { error });
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          
          sendSSEMessage(encoder, controller, {
            type: 'error',
            code: errorMessage.includes('size') ? 
              ERROR_TYPES.PAYLOAD_TOO_LARGE : 
              ERROR_TYPES.TRANSCRIPTION_ERROR,
            message: errorMessage
          });
        } finally {
          if (tmpDir) {
            try {
              // Check if directory exists before attempting to remove it
              const exists = await fs.promises.access(tmpDir)
                .then(() => true)
                .catch(() => false);
              
              if (exists) {
                await fs.promises.rm(tmpDir, { recursive: true, force: true });
                logger.debug('Cleaned up temporary directory:', { tmpDir });
              }
            } catch (error) {
              logger.warn('Failed to clean up temporary directory:', { tmpDir, error });
            }
          }
          controller.close();
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
  );
}