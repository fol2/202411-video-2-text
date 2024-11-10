export interface TranscriptionResult {
  id: string;
  text: string;
  createdAt: string;
  metadata?: {
    duration?: number;
    language?: string;
    confidence?: number;
    model?: string;
    processingTime?: number;
    wordCount?: number;
    transcribedAt?: string;
    [key: string]: any;
  }
} 