export interface TranslatedContent {
  [languageCode: string]: string;
}

export interface TranscriptionMetadata {
  title?: string;
  duration?: number;
  language?: string;
  youtubeUrl?: string;
  srtContent?: string;
  translations?: TranslatedContent;
}

export interface TranscriptionResult {
  id: string;
  createdAt: string;
  text: string;
  metadata?: TranscriptionMetadata;
} 