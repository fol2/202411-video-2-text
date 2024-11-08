import VideoTranscription from '@/components/template/video-transcription'

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto py-4">
          <h1 className="text-2xl font-bold text-center">
            Video to Text Transcription
          </h1>
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
          
          <VideoTranscription />
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