'use client'

import { useState, useRef, useEffect, useCallback, memo } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Upload, Link, Play, AlertCircle, X, CheckCircle } from 'lucide-react'
import { cn } from "@/lib/utils"
import { Alert, AlertDescription } from "@/components/ui/alert"

// Language options based on Whisper's supported languages
const LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'Auto Detect' },
  { value: 'en', label: 'English' },
  { value: 'zh', label: 'Chinese' },
  { value: 'de', label: 'German' },
  { value: 'es', label: 'Spanish' },
  { value: 'ru', label: 'Russian' },
  { value: 'ko', label: 'Korean' },
  { value: 'fr', label: 'French' },
  { value: 'ja', label: 'Japanese' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'tr', label: 'Turkish' },
  { value: 'pl', label: 'Polish' },
  { value: 'ca', label: 'Catalan' },
  { value: 'nl', label: 'Dutch' },
  { value: 'ar', label: 'Arabic' },
  { value: 'sv', label: 'Swedish' },
  { value: 'it', label: 'Italian' },
  { value: 'id', label: 'Indonesian' },
  { value: 'hi', label: 'Hindi' },
  { value: 'fi', label: 'Finnish' },
  { value: 'vi', label: 'Vietnamese' },
  // Add more languages as needed
]

type ErrorCode = 'PAYLOAD_TOO_LARGE' | 'PYTHON_ENV_ERROR' | 'TRANSCRIPTION_ERROR';

interface ErrorMessage {
  type: 'error';
  code: ErrorCode;
  message: string;
}

// Add interface for detailed progress info
interface DetailedProgress {
  progress: number
  speed?: string
  eta?: string
  timeElapsed?: string
  currentStep?: string
  totalSteps?: string
  stepsPerSecond?: string
}

// Add a custom hook to handle progress updates
const useProgress = () => {
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [details, setDetails] = useState<DetailedProgress>({ progress: 0 })
  const startTime = useRef<number>(Date.now())

  const updateProgress = useCallback((value: number, message?: string, detailedInfo?: Partial<DetailedProgress>) => {
    setProgress(value)
    if (message) setStatus(message)
    if (detailedInfo) {
      const timeElapsed = ((Date.now() - startTime.current) / 1000).toFixed(0)
      setDetails({
        progress: value,
        timeElapsed: `${Math.floor(parseInt(timeElapsed) / 60)}:${(parseInt(timeElapsed) % 60).toString().padStart(2, '0')}`,
        ...detailedInfo
      })
    }
  }, [])

  const resetProgress = useCallback(() => {
    startTime.current = Date.now()
    setProgress(0)
    setStatus('')
    setDetails({ progress: 0 })
  }, [])

  return { progress, status, details, updateProgress, resetProgress }
}

interface Props {
  showDebug?: boolean
}

// Add this function near the top with other utility functions
const getYoutubeVideoId = (url: string): string | null => {
  try {
    const urlObj = new URL(url)
    if (urlObj.hostname.includes('youtube.com')) {
      return urlObj.searchParams.get('v')
    } else if (urlObj.hostname === 'youtu.be') {
      return urlObj.pathname.slice(1)
    } else if (urlObj.pathname.includes('/shorts/')) {
      return urlObj.pathname.split('/shorts/')[1]
    }
  } catch (e) {
    return null
  }
  return null
}

// Add this function to fetch YouTube video title
const fetchYouTubeTitle = async (videoId: string) => {
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
    const data = await response.json()
    return data.title
  } catch (e) {
    return null
  }
}

// Add new interfaces for upload state
interface UploadState {
  progress: number
  speed: string
  status: 'idle' | 'uploading' | 'complete' | 'error'
  isUploading: boolean
  uploadId?: string  // Add this to store the upload ID
}

export default function Component({ showDebug = false }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [youtubeLink, setYoutubeLink] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [transcription, setTranscription] = useState('')
  const [error, setError] = useState('')
  const [selectedLanguage, setSelectedLanguage] = useState('auto')
  const [activeTab, setActiveTab] = useState('upload')
  const [videoTitle, setVideoTitle] = useState<string | null>(null)

  const logsEndRef = useRef<HTMLDivElement>(null)

  // Use the custom hook
  const { progress, status, details, updateProgress, resetProgress } = useProgress()

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  const [uploadState, setUploadState] = useState<UploadState>({
    progress: 0,
    speed: '',
    status: 'idle',
    isUploading: false
  })
  const uploadRef = useRef<XMLHttpRequest | null>(null)

  // Add beforeunload handler
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (uploadState.isUploading) {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [uploadState.isUploading])

  // Update handleFileChange to handle upload
  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const selectedFile = event.target.files[0]
      
      // Validate file type
      const validTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']
      if (!validTypes.includes(selectedFile.type)) {
        setError('Please select a valid video file (MP4, WebM, OGG, or MOV)')
        return
      }

      // Validate file size (500MB limit)
      if (selectedFile.size > 500 * 1024 * 1024) {
        setError('File size must be less than 500MB')
        return
      }

      setFile(selectedFile)
      setYoutubeLink('')
      setError('')
      
      // Start upload automatically
      await handleUpload(selectedFile)
    }
  }, [])

  // Add upload handler
  const handleUpload = useCallback(async (fileToUpload: File) => {
    const formData = new FormData()
    formData.append('file', fileToUpload)
    formData.append('language', selectedLanguage)

    setUploadState(prev => ({ ...prev, isUploading: true, status: 'uploading' }))
    setError('')

    const xhr = new XMLHttpRequest()
    uploadRef.current = xhr

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const progress = (event.loaded / event.total) * 100
        const speed = formatSpeed(event.loaded, event.timeStamp)
        setUploadState(prev => ({
          ...prev,
          progress,
          speed,
          status: 'uploading'
        }))
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText)
          setUploadState(prev => ({
            ...prev,
            status: 'complete',
            isUploading: false,
            uploadId: response.uploadId
          }))
        } catch (e) {
          setError('Failed to parse server response')
          setUploadState(prev => ({
            ...prev,
            status: 'error',
            isUploading: false
          }))
        }
      } else {
        setError('Upload failed')
        setUploadState(prev => ({
          ...prev,
          status: 'error',
          isUploading: false
        }))
      }
    })

    xhr.addEventListener('error', () => {
      setError('Upload failed')
      setUploadState(prev => ({
        ...prev,
        status: 'error',
        isUploading: false
      }))
    })

    xhr.open('POST', '/api/upload')
    xhr.send(formData)
  }, [selectedLanguage])

  // Add cancel upload handler
  const handleCancelUpload = useCallback(() => {
    if (uploadRef.current) {
      uploadRef.current.abort()
      uploadRef.current = null
    }
  }, [])

  // Add helper function for formatting upload speed
  const formatSpeed = (loaded: number, timestamp: number): string => {
    const elapsed = timestamp / 1000 // Convert to seconds
    const bps = loaded / elapsed
    const mbps = bps / (1024 * 1024)
    return `${mbps.toFixed(2)} MB/s`
  }

  // Update handleYoutubeLinkChange to fetch title
  const handleYoutubeLinkChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    setYoutubeLink(value)
    setFile(null)
    setError('')
    setVideoTitle(null)
    
    // Basic YouTube URL validation
    if (value && !isValidYoutubeUrl(value)) {
      setError('Please enter a valid YouTube URL')
    } else if (value) {
      const videoId = getYoutubeVideoId(value)
      if (videoId) {
        const title = await fetchYouTubeTitle(videoId)
        setVideoTitle(title)
      }
    }
  }

  // Add YouTube URL validation helper
  const isValidYoutubeUrl = (url: string): boolean => {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/
    return youtubeRegex.test(url)
  }

  // Modify the addLog function to always add logs, regardless of debug mode
  const addLog = useCallback((message: string) => {
    setLogs(prev => [...prev, message])
  }, [])

  const handleServerMessage = (data: any) => {
    // Always log to console for development purposes
    console.log('Server message:', data)
    
    switch (data.type) {
      case 'status':
        updateProgress(progress, data.message)
        addLog(`Status: ${data.message}`)
        break
      
      case 'progress':
        if (typeof data.progress === 'number') {
          const progressValue = Math.min(Math.max(data.progress, 0), 100)
          updateProgress(progressValue, data.message, {
            speed: data.speed,
            eta: data.eta,
            currentStep: data.currentStep,
            totalSteps: data.totalSteps,
            stepsPerSecond: data.stepsPerSecond
          })
          addLog(`Progress: ${progressValue.toFixed(1)}% - ${data.message || ''}`)
        }
        break
      
      case 'log':
        if (data.message?.trim()) {
          addLog(data.message.trim())
        }
        break
      
      case 'complete':
        setTranscription(data.transcription)
        setIsTranscribing(false)
        addLog('Transcription complete!')
        break
      
      case 'error':
        setError(data.message)
        setIsTranscribing(false)
        addLog(`Error: ${data.message}`)
        break
    }
  }

  // Modify the progress monitoring effect
  useEffect(() => {
    if (showDebug) {
      console.log('Progress updated:', progress) // Only log when debug is enabled
    }
  }, [progress, showDebug])

  const startTranscription = async () => {
    try {
      setIsTranscribing(true)
      setLogs([])
      setTranscription('')
      setError('')
      resetProgress()

      const formData = new FormData()
      if (uploadState.uploadId) {
        formData.append('uploadId', uploadState.uploadId)
      } else if (youtubeLink) {
        formData.append('youtubeLink', youtubeLink)
      }
      formData.append('language', selectedLanguage)

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        const events = text.split('\n\n')
        
        for (const event of events) {
          if (!event.trim() || !event.startsWith('data: ')) continue
          
          try {
            const data = JSON.parse(event.slice(6))
            handleServerMessage(data)
          } catch (parseError) {
            console.error('Error parsing event:', parseError)
            setLogs(prev => [...prev, `Error parsing server response: ${parseError}`])
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to transcribe'
      setError(errorMessage)
      setLogs(prev => [...prev, `Error: ${errorMessage}`])
      setIsTranscribing(false)
    }
  }

  // Update the ProgressDisplay component to show detailed information
  const ProgressDisplay = memo(({ value, status, details }: { 
    value: number, 
    status: string,
    details: DetailedProgress 
  }) => {
    const getDetailedStatus = () => {
      if (details.currentStep && details.totalSteps) {
        // Format transcription status in a more readable way
        const progress = `${value.toFixed(1)}%`
        const chunks = `Chunk ${details.currentStep}/${details.totalSteps}`
        const timing = `${details.timeElapsed} elapsed, ${details.eta} remaining`
        const speed = details.stepsPerSecond ? 
          `Processing speed: ${details.stepsPerSecond.replace('it/s', 'chunks/sec')}` : ''
        
        return (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div>Progress: {progress}</div>
            <div>{chunks}</div>
            <div>{timing}</div>
            <div>{speed}</div>
          </div>
        )
      } else if (details.speed) {
        // Download status format
        return (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div>Download speed: {details.speed}</div>
            <div>Time elapsed: {details.timeElapsed}</div>
            <div>Time remaining: {details.eta}</div>
            <div>Progress: {value.toFixed(1)}%</div>
          </div>
        )
      }
      return ''
    }

    return (
      <div className="space-y-2 w-full">
        <div className="flex justify-between text-sm text-gray-500">
          <span className="truncate max-w-[80%] font-medium">{status}</span>
          <span className="font-medium">{value.toFixed(1)}%</span>
        </div>
        <Progress 
          value={value} 
          className="h-2 transition-all duration-200" 
        />
        <div className="text-xs text-gray-500 font-mono bg-gray-50 p-2 rounded-md">
          {getDetailedStatus()}
        </div>
      </div>
    )
  })

  // Update the YouTubeInput component
  const YouTubeInput = () => (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Link className="w-5 h-5 text-red-500 flex-shrink-0" />
        <Input 
          type="url"
          placeholder="https://www.youtube.com/watch?v=..." 
          value={youtubeLink}
          onChange={handleYoutubeLinkChange}
          className={cn(
            "flex-1",
            error && "border-red-500 focus-visible:ring-red-500"
          )}
        />
      </div>
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      {/* Show instructions only when no valid URL is entered */}
      {(!youtubeLink || error) && (
        <div className="text-sm text-muted-foreground">
          Supported formats:
          <ul className="list-disc list-inside ml-2 mt-1">
            <li>youtube.com/watch?v=...</li>
            <li>youtu.be/...</li>
            <li>youtube.com/shorts/...</li>
          </ul>
        </div>
      )}
    </div>
  )

  // Update the FileUpload component
  const FileUpload = () => (
    <div className="space-y-4">
      {uploadState.status === 'idle' ? (
        <div className="flex items-center justify-center w-full">
          <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <Upload className="w-8 h-8 mb-4 text-gray-500" />
              <p className="mb-2 text-sm text-gray-500">
                <span className="font-semibold">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-gray-500">MP4, WebM, OGG, or MOV (MAX. 500MB)</p>
            </div>
            <Input 
              id="dropzone-file" 
              type="file" 
              className="hidden" 
              onChange={handleFileChange} 
              accept="video/mp4,video/webm,video/ogg,video/quicktime" 
            />
          </label>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">
              {uploadState.status === 'complete' 
                ? 'Upload Complete' 
                : uploadState.status === 'uploading'
                ? 'Uploading video...'
                : 'Upload Failed'}
            </span>
            {uploadState.status === 'uploading' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelUpload}
                className="h-8 px-2"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {uploadState.status === 'uploading' ? (
            <>
              <Progress value={uploadState.progress} />
              <div className="text-sm text-muted-foreground">
                Upload speed: {uploadState.speed}
              </div>
            </>
          ) : uploadState.status === 'complete' ? (
            <div className="flex items-center space-x-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span>Ready for transcription</span>
            </div>
          ) : null}
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {file && !uploadState.isUploading && (
        <p className="mt-2 text-sm text-gray-500">Selected file: {file.name}</p>
      )}
    </div>
  )

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center">Video Transcription</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Language Selection */}
          <div className="space-y-2">
            <label htmlFor="language" className="text-sm font-medium">
              Source Language
            </label>
            <select
              id="language"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="w-full p-2 border rounded-md"
            >
              {LANGUAGE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <Tabs 
            value={activeTab} 
            onValueChange={setActiveTab} 
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload" className="cursor-pointer">
                <Upload className="w-4 h-4 mr-2" />
                Upload Video
              </TabsTrigger>
              <TabsTrigger value="youtube" className="cursor-pointer">
                <Link className="w-4 h-4 mr-2" />
                YouTube Link
              </TabsTrigger>
            </TabsList>
            <TabsContent value="upload" className="pt-4">
              <FileUpload />
            </TabsContent>
            <TabsContent value="youtube" className="pt-4">
              <YouTubeInput />
            </TabsContent>
          </Tabs>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-center space-y-4">
        <Button 
          onClick={startTranscription} 
          disabled={isTranscribing || (activeTab === 'upload' && uploadState.status !== 'complete') || (activeTab === 'youtube' && (!youtubeLink || !!error))}
          className="w-full"
        >
          <Play className="w-4 h-4 mr-2" />
          {isTranscribing ? 'Transcribing...' : 'Start Transcription'}
        </Button>

        {isTranscribing && (
          <ProgressDisplay 
            value={progress} 
            status={status} 
            details={details}
          />
        )}

        {transcription && (
          <div className="mt-4 border rounded-lg p-4 w-full">
            <h3 className="text-lg font-semibold mb-2">Transcription</h3>
            <p className="whitespace-pre-wrap">{transcription}</p>
          </div>
        )}

        {/* YouTube embed after transcription */}
        {youtubeLink && !error && (
          <div className="w-full space-y-2">
            {videoTitle && (
              <h3 className="text-lg font-medium text-gray-900">{videoTitle}</h3>
            )}
            <div className="aspect-video w-full">
              <iframe
                src={`https://www.youtube.com/embed/${getYoutubeVideoId(youtubeLink)}`}
                className="w-full h-full rounded-lg"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        )}

        {/* Debug console at the bottom */}
        <div 
          className={cn(
            "mt-4 border rounded-lg p-4 bg-black text-white w-full",
            !showDebug && "hidden" // Hide with CSS when debug is off
          )}
        >
          <div className="font-mono text-sm h-64 overflow-auto">
            {logs.map((log, i) => (
              <div key={i} className="whitespace-pre-wrap text-green-400">
                {`[${new Date().toLocaleTimeString()}] ${log}`}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      </CardFooter>
    </Card>
  )
}