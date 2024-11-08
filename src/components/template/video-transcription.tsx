'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Upload, Link, Play } from 'lucide-react'

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

export default function Component() {
  const [file, setFile] = useState<File | null>(null)
  const [youtubeLink, setYoutubeLink] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [logs, setLogs] = useState<string[]>([])
  const [transcription, setTranscription] = useState('')
  const [error, setError] = useState('')
  const [selectedLanguage, setSelectedLanguage] = useState('auto')
  const [activeTab, setActiveTab] = useState('upload')

  const logsEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0])
      setYoutubeLink('')
      setError('')
    }
  }

  const handleYoutubeLinkChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setYoutubeLink(event.target.value)
    setFile(null)
    setError('')
  }

  const startTranscription = async () => {
    try {
      setIsTranscribing(true)
      setProgress(0)
      setLogs([])
      setTranscription('')
      setError('')

      const formData = new FormData()
      if (file) {
        formData.append('file', file)
      } else if (youtubeLink) {
        formData.append('youtubeLink', youtubeLink)
      }
      formData.append('language', selectedLanguage)

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

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
          const data = JSON.parse(event.slice(6))

          switch (data.type) {
            case 'status':
              setStatus(data.message)
              break
            case 'progress':
              setProgress(data.progress)
              break
            case 'log':
              setLogs(prev => [...prev, data.message])
              break
            case 'complete':
              setTranscription(data.transcription)
              setIsTranscribing(false)
              break
            case 'error':
              setError(data.message)
              setIsTranscribing(false)
              break
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to transcribe')
      setIsTranscribing(false)
    }
  }

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
              <TabsTrigger 
                value="upload"
                onClick={() => setActiveTab('upload')}
              >
                Upload Video
              </TabsTrigger>
              <TabsTrigger 
                value="youtube"
                onClick={() => setActiveTab('youtube')}
              >
                YouTube Link
              </TabsTrigger>
            </TabsList>
            <TabsContent value="upload">
              <div className="flex items-center justify-center w-full">
                <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-8 h-8 mb-4 text-gray-500" />
                    <p className="mb-2 text-sm text-gray-500">
                      <span className="font-semibold">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-gray-500">MP4, WebM or OGG (MAX. 800MB)</p>
                  </div>
                  <Input 
                    id="dropzone-file" 
                    type="file" 
                    className="hidden" 
                    onChange={handleFileChange} 
                    accept="video/*" 
                  />
                </label>
              </div>
              {file && <p className="mt-2 text-sm text-gray-500">Selected file: {file.name}</p>}
            </TabsContent>
            <TabsContent value="youtube">
              <div className="flex items-center space-x-2">
                <Link className="w-5 h-5 text-red-500" />
                <Input 
                  type="text" 
                  placeholder="Paste YouTube link here" 
                  value={youtubeLink}
                  onChange={handleYoutubeLinkChange}
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-center space-y-4">
        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}
        <Button 
          onClick={startTranscription} 
          disabled={isTranscribing || (!file && !youtubeLink)}
          className="w-full"
        >
          <Play className="w-4 h-4 mr-2" />
          Start Transcription
        </Button>
        {isTranscribing && (
          <div className="space-y-2">
            <div className="text-sm text-gray-500">{status}</div>
            <Progress value={progress} />
          </div>
        )}
        {logs.length > 0 && (
          <div className="mt-4 border rounded-lg p-4 bg-black text-white">
            <div className="font-mono text-sm h-64 overflow-auto">
              {logs.map((log, i) => (
                <div key={i} className="whitespace-pre-wrap">{log}</div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}
        {transcription && (
          <div className="mt-4 border rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-2">Transcription</h3>
            <p className="whitespace-pre-wrap">{transcription}</p>
          </div>
        )}
      </CardFooter>
    </Card>
  )
} 