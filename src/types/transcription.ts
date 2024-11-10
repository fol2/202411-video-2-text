export interface TranscriptionResult {
  id: string;
  createdAt: string;
  text: string;
  sourceLanguage?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  duration?: number;
  isDeleted?: boolean;
  deletedAt?: string;
} 