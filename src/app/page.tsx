'use client'

import VideoTranscription from '@/components/template/video-transcription'
import { useState } from 'react'
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

export default function Home() {
  const [showDebug, setShowDebug] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-center flex-1">
              Video to Text Transcription
            </h1>
            <div className="flex items-center gap-2">
              <Label htmlFor="debug-mode" className="text-sm">Debug Mode</Label>
              <Switch
                id="debug-mode"
                checked={showDebug}
                onCheckedChange={setShowDebug}
              />
            </div>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 text-center">
            <p className="text-muted-foreground">
              Upload a video file or paste a YouTube link to get started.
              Powered by vid2cleantxt and OpenAI Whisper.
            </p>
          </div>
          
          <VideoTranscription showDebug={showDebug} />
        </div>
      </main>

      <footer className="border-t mt-auto">
        <div className="container mx-auto py-4 text-center text-sm text-muted-foreground">
          <p>Built with Next.js and vid2cleantxt</p>
        </div>
      </footer>
    </div>
  )
} 