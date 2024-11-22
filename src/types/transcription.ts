export interface TranscriptionResult {
  id: string;
  createdAt: string;
  text: string;
  metadata?: {
    title?: string;
    duration?: number;
    language?: string;
    youtubeUrl?: string;
    confidence?: number;
    srtContent?: string;
  };
} 