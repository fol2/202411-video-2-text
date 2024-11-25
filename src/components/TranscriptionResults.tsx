import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Copy, Download, Clock, Globe, CheckCircle2, Edit2, Eye, EyeOff, ChevronDown, ChevronRight, ChevronLeft, ChevronUp, Maximize2, Minimize2, X, FileText, FileJson, Subtitles, RefreshCw } from 'lucide-react'
import { TranscriptionResult, TranscriptionMetadata, TranslatedContent } from '@/types/transcription'
import { ErrorBoundary, FallbackProps } from 'react-error-boundary'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

// Add ErrorFallback component
function ErrorFallback({ error }: FallbackProps) {
  return (
    <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
      <h2 className="text-red-800 font-semibold">Something went wrong:</h2>
      <pre className="text-sm text-red-600">{error.message}</pre>
    </div>
  )
}

// Dynamic import of TipTap editor for rich text editing
const RichTextEditor = dynamic(() => import('./RichTextEditor'), {
  ssr: false,
  loading: () => <div className="animate-pulse h-32 bg-gray-100 rounded-lg" />
})

interface FloatingToolbarProps {
  range: Range;
  onFormat: (format: string) => void;
}

const FloatingToolbar: React.FC<FloatingToolbarProps> = ({ range, onFormat }) => {
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (toolbarRef.current) {
      const rect = range.getBoundingClientRect()
      const toolbar = toolbarRef.current.getBoundingClientRect()

      setPosition({
        top: rect.top - toolbar.height - 10,
        left: rect.left + (rect.width - toolbar.width) / 2
      })
    }
  }, [range])

  return (
    <motion.div
      ref={toolbarRef}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="fixed z-50 bg-popover text-popover-foreground shadow-lg rounded-lg border border-border p-2 flex gap-2"
      style={{ top: position.top, left: position.left }}
    >
      <Button size="sm" variant="ghost" onClick={() => onFormat('bold')}>B</Button>
      <Button size="sm" variant="ghost" onClick={() => onFormat('italic')}>I</Button>
      <Button size="sm" variant="ghost" onClick={() => onFormat('underline')}>U</Button>
    </motion.div>
  )
}

interface TranscriptionResultsProps {
  result: TranscriptionResult;
  onRemove?: () => void;
  className?: string;
  onUpdate?: (updatedResult: TranscriptionResult) => void;
}

// Add new interfaces for section management
interface TranscriptionSection {
  id: string
  text: string
  startTime?: number
  endTime?: number
  isExpanded: boolean
}

// Add new props interface for collapsible section
interface CollapsibleSectionProps {
  section: TranscriptionSection
  onToggle: (id: string) => void
  isPreview?: boolean
  isEditing: boolean
  onSectionEdit: (id: string, content: string) => void
  editorRef: React.RefObject<any>
  className?: string
  disableAnimations?: boolean
}

const PREVIEW_LENGTH = 150 // Characters to show in preview
const SECTION_LENGTH = 1000 // Characters per section

// Add CollapsibleSection component
const CollapsibleSection = memo(({
  section,
  onToggle,
  isPreview,
  isEditing,
  onSectionEdit,
  editorRef,
  className,
  disableAnimations
}: CollapsibleSectionProps) => {
  const previewText = section.text.slice(0, PREVIEW_LENGTH) + (section.text.length > PREVIEW_LENGTH ? '...' : '')
  
  return (
    <div 
      className={cn(
        "border rounded-lg p-2",
        "hover:bg-muted/50",
        className
      )}
    >
      <div className="flex items-start gap-2">
        {!isEditing && (
          <div 
            className="flex-shrink-0 pt-1 cursor-pointer"
            onClick={() => onToggle(section.id)}
          >
            {section.isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </div>
        )}
        <motion.div 
          className={cn(
            "flex-grow min-w-0",
            !isEditing && 'cursor-pointer'
          )}
          initial={false}
          animate={{ 
            height: section.isExpanded ? 'auto' : '1.5rem',
            opacity: 1 
          }}
          transition={disableAnimations ? { duration: 0 } : { duration: 0.2 }}
          onClick={() => !isEditing && onToggle(section.id)}
        >
          {section.isExpanded ? (
            <div className="whitespace-pre-wrap text-sm break-words overflow-hidden">
              {isEditing ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <RichTextEditor
                    initialContent={section.text}
                    onChange={(content) => onSectionEdit(section.id, content)}
                    ref={editorRef}
                  />
                </div>
              ) : (
                <div 
                  dangerouslySetInnerHTML={{ __html: section.text }}
                  className="break-words overflow-wrap-anywhere"
                />
              )}
            </div>
          ) : (
            <div className="text-sm text-foreground/70 dark:text-foreground/70 truncate">
              {previewText}
            </div>
          )}
        </motion.div>
        {section.startTime !== undefined && (
          <div className="flex-shrink-0 text-xs text-muted-foreground ml-2">
            {formatTimestamp(section.startTime)}
          </div>
        )}
      </div>
    </div>
  )
})

// Update DownloadFormat type
type DownloadFormat = 'html' | 'markdown' | 'txt' | 'srt';

// Add this interface for the download menu
interface DownloadMenuProps {
  onDownload: (format: DownloadFormat, targetLanguage?: string, onProgress?: (status: TranslationStatus) => void) => Promise<void>;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  result: TranscriptionResult;
}

// Add these helper functions before the TranscriptionResults component
const generateMarkdown = (sections: TranscriptionSection[], editedSections: Record<string, string>, result: TranscriptionResult): string => {
  const title = result.metadata?.title || 'Transcription';
  const metadata = [
    `# ${title}\n`,
    `- Date: ${new Date().toLocaleString()}`,
    result.metadata?.language ? `- Language: ${result.metadata.language}` : '',
    result.metadata?.duration ? `- Duration: ${formatDuration(result.metadata.duration)}` : '',
    result.metadata?.confidence ? `- Confidence: ${(result.metadata.confidence * 100).toFixed(1)}%` : '',
    '\n## Content\n'
  ].filter(Boolean).join('\n');

  const content = sections
    .map(section => editedSections[section.id] || section.text)
    .join('\n\n');

  return `${metadata}\n${content}`;
};

const generatePlainText = (sections: TranscriptionSection[], editedSections: Record<string, string>, result: TranscriptionResult): string => {
  const title = result.metadata?.title || 'Transcription';
  const metadata = [
    title,
    '=' .repeat(title.length), // Add underline for the title
    '',
    `Date: ${new Date().toLocaleString()}`,
    result.metadata?.language ? `Language: ${result.metadata.language}` : '',
    result.metadata?.duration ? `Duration: ${formatDuration(result.metadata.duration)}` : '',
    result.metadata?.confidence ? `Confidence: ${(result.metadata.confidence * 100).toFixed(1)}%` : '',
    '\nContent:\n'
  ].filter(Boolean).join('\n');

  const content = sections
    .map(section => editedSections[section.id] || section.text)
    .join('\n\n');

  return `${metadata}\n${content}`;
};

// Add this type near the top of the file
type TranslationLanguage = {
  code: string;
  name: string;
};

// Update supported translation languages
const TRANSLATION_LANGUAGES: TranslationLanguage[] = [
  { code: 'zh-TW', name: 'Traditional Chinese' },
  { code: 'zh-CN', name: 'Simplified Chinese' },
  { code: 'zh-HK', name: 'Cantonese' },
  { code: 'es', name: 'Spanish' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ar', name: 'Arabic' },
  { code: 'fr', name: 'French' },
  { code: 'ru', name: 'Russian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'de', name: 'German' },
];

// Add this interface
interface TranslationStatus {
  currentChunk: number;
  totalChunks: number;
  percentComplete: number;
  model: string;
}

// Update the translateAndDownloadSRT function
const translateAndDownloadSRT = async (
  srtContent: string,
  title: string,
  targetLanguage: string,
  onProgress?: (status: TranslationStatus) => void
) => {
  try {
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        srtContent,
        targetLanguage,
      }),
    });

    if (!response.ok) throw new Error('Translation failed');
    
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    let translatedContent = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = new TextDecoder().decode(value);
      const events = chunk.split('\n\n').filter(Boolean);
      
      for (const event of events) {
        const data = JSON.parse(event.replace('data: ', ''));
        
        if (data.type === 'progress') {
          onProgress?.({
            currentChunk: data.currentChunk,
            totalChunks: data.totalChunks,
            percentComplete: data.percentComplete,
            model: data.model
          });
        } else if (data.type === 'complete') {
          translatedContent = data.translatedContent;
        } else if (data.type === 'error') {
          throw new Error(data.error);
        }
      }
    }

    return translatedContent;
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
};

// Update the TranslationManager to include better linking
const TranslationManager = {
  STORAGE_KEY: 'translationHistory',

  // Get translations for a specific transcription
  getTranslations: (transcriptionId: string) => {
    try {
      const data = localStorage.getItem(TranslationManager.STORAGE_KEY);
      if (!data) return {};
      
      const translations = JSON.parse(data);
      return translations[transcriptionId] || {};
    } catch (error) {
      console.error('Failed to get translations:', error);
      return {};
    }
  },

  // Save a new translation with metadata
  saveTranslation: (transcriptionId: string, languageCode: string, content: string) => {
    try {
      const data = localStorage.getItem(TranslationManager.STORAGE_KEY);
      const translations = data ? JSON.parse(data) : {};
      
      // Simply update the translation content
      translations[transcriptionId] = {
        ...(translations[transcriptionId] || {}),
        translations: {
          ...(translations[transcriptionId]?.translations || {}),
          [languageCode]: {
            content,
            updatedAt: new Date().toISOString()
          }
        }
      };

      localStorage.setItem(TranslationManager.STORAGE_KEY, JSON.stringify(translations));
      return true;
    } catch (error) {
      console.error('Failed to save translation:', error);
      return false;
    }
  },

  // Get a specific translation
  getTranslation: (transcriptionId: string, languageCode: string) => {
    try {
      const translations = TranslationManager.getTranslations(transcriptionId);
      return translations?.translations?.[languageCode]?.content;
    } catch (error) {
      console.error('Failed to get translation:', error);
      return null;
    }
  },

  // List available languages for a transcription
  getAvailableLanguages: (transcriptionId: string) => {
    try {
      const translations = TranslationManager.getTranslations(transcriptionId);
      return translations?.metadata?.availableLanguages || [];
    } catch (error) {
      console.error('Failed to get available languages:', error);
      return [];
    }
  }
};

// Update the DownloadMenu component
const DownloadMenu: React.FC<DownloadMenuProps> = ({ onDownload, isOpen, setIsOpen, result }) => {
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  const [translationStatus, setTranslationStatus] = useState<TranslationStatus | null>(null);
  const [showTranslations, setShowTranslations] = useState(false);
  const [showLanguageSelect, setShowLanguageSelect] = useState(false);

  // Get available translations
  const availableTranslations = useMemo(() => {
    const translations = TranslationManager.getTranslations(result.id);
    const translatedLanguages = translations?.translations || {};
    return Object.keys(translatedLanguages).map(code => {
      const language = TRANSLATION_LANGUAGES.find(lang => lang.code === code);
      return language ? { 
        code, 
        name: language.name,
        content: translatedLanguages[code].content
      } : null;
    }).filter((lang): lang is { code: string; name: string; content: string } => lang !== null);
  }, [result.id, result.metadata?.translations]);

  // Add handleTranslationDownload function
  const handleTranslationDownload = async (code: string, content: string) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const title = result.metadata?.title?.replace(/[^a-z0-9]/gi, '_') || 'transcription';
    const filename = `${title}-${code}-${timestamp}.srt`;
    
    // Create blob and download
    const blob = new Blob([content], { type: 'application/x-subrip;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  // Update the handleRegenerateTranslation function in DownloadMenu
  const handleRegenerateTranslation = async (code: string) => {
    try {
      // Set initial status
      setTranslationStatus({
        currentChunk: 0,
        totalChunks: 0,
        percentComplete: 0,
        model: "gpt-4o-mini"
      });

      // Keep menu open and show progress
      setIsOpen(true);
      setShowTranslations(true);

      // Start translation with progress tracking
      await onDownload('srt', code, (status) => {
        setTranslationStatus(status);
      });

      // Reset status after completion
      setTranslationStatus(null);

      // Brief delay before closing to show completion
      setTimeout(() => {
        setShowTranslations(false);
        setIsOpen(false);
      }, 500);
    } catch (error) {
      console.error('Regeneration failed:', error);
      setTranslationStatus(null);
    }
  };

  // Handle new translation
  const handleNewTranslation = async (languageCode: string) => {
    setSelectedLanguage(languageCode);
    setTranslationStatus({
      currentChunk: 0,
      totalChunks: 0,
      percentComplete: 0,
      model: "gpt-4o-mini"
    });

    try {
      await onDownload('srt', languageCode, (status) => {
        setTranslationStatus(status);
      });

      setTranslationStatus(null);
      setSelectedLanguage(null);
      setShowLanguageSelect(false);
      setShowTranslations(true);
    } catch (error) {
      console.error('Translation failed:', error);
      setTranslationStatus(null);
      setSelectedLanguage(null);
    }
  };

  // In the DownloadMenu component, add this effect to reset states when menu is closed
  useEffect(() => {
    if (!isOpen) {
      // Reset all submenu states when main menu is closed
      setTimeout(() => {
        setShowTranslations(false);
        setShowLanguageSelect(false);
      }, 200); // Small delay to allow exit animations to complete
    }
  }, [isOpen]);

  return (
    <div className="relative">
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => {
          if (!isOpen) {
            // When opening, ensure we start at the main menu
            setShowTranslations(false);
            setShowLanguageSelect(false);
          }
          setIsOpen(!isOpen);
        }}
        className="gap-2"
      >
        <Download className="w-4 h-4" />
        Download
        <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen ? "rotate-180" : "")} />
      </Button>
      
      {/* Main Download Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ 
              opacity: showTranslations || showLanguageSelect ? 0.5 : 1,
              y: 0 
            }}
            exit={{ opacity: 0, y: -10 }}
            className={cn(
              "fixed mt-2 w-72 rounded-md shadow-lg bg-popover border border-border",
              (showTranslations || showLanguageSelect) && "pointer-events-none" // Disable interactions when submenu is open
            )}
            style={{ 
              position: 'fixed',
              top: 'auto',
              left: 'auto',
              transform: 'translateY(calc(100% + 0.5rem))',
              zIndex: 999
            }}
          >
            <div className="py-1">
              {/* Original formats section */}
              <div className="px-4 py-2">
                <div className="text-sm font-medium text-foreground mb-2">
                  Original Content
                </div>
                {[
                  { format: 'html' as const, label: 'HTML Document', icon: FileText },
                  { format: 'markdown' as const, label: 'Markdown', icon: FileJson },
                  { format: 'txt' as const, label: 'Plain Text', icon: FileText },
                  { format: 'srt' as const, label: 'Original SRT', icon: Subtitles }
                ].map(({ format, label, icon: Icon }) => (
                  <button
                    key={format}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2 rounded-sm",
                      format === 'srt' && !result.metadata?.srtContent && "opacity-50 cursor-not-allowed"
                    )}
                    onClick={() => {
                      if (format === 'srt' && !result.metadata?.srtContent) return;
                      onDownload(format);
                      setIsOpen(false);
                    }}
                    disabled={format === 'srt' && !result.metadata?.srtContent}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Translations Button */}
              {result.metadata?.srtContent && (
                <div className="px-4 py-2 border-t border-border">
                  <button
                    className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted rounded-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowTranslations(true);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      <span>Translations</span>
                      {availableTranslations.length > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          {availableTranslations.length}
                        </Badge>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Translations Submenu */}
      <AnimatePresence>
        {isOpen && showTranslations && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ 
              opacity: showLanguageSelect ? 0.5 : 1,
              x: 0 
            }}
            exit={{ opacity: 0, x: 20 }}
            className={cn(
              "fixed mt-2 w-72 rounded-md shadow-lg bg-popover border border-border",
              showLanguageSelect && "pointer-events-none" // Disable interactions when language select is open
            )}
            style={{ 
              position: 'fixed',
              top: 'auto',
              left: 'auto',
              transform: 'translate(calc(100% + 0.5rem), 0)',
              zIndex: 1000,
              backdropFilter: showLanguageSelect ? 'blur(2px)' : 'none'
            }}
          >
            <div className="sticky top-0 bg-popover border-b border-border p-2 flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => {
                  setShowTranslations(false);
                  // Don't need to explicitly set showLanguageSelect to false here
                  // as it's already handled by the effect when closing
                }}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="font-medium">Translations</span>
            </div>

            <div className="py-2">
              {/* Available Translations */}
              {availableTranslations.length > 0 && (
                <div className="px-4 py-2">
                  <div className="text-sm font-medium text-foreground mb-2">
                    Available Translations
                  </div>
                  {availableTranslations.map(({ code, name, content }) => (
                    <div
                      key={code}
                      className="flex items-center gap-1 py-0.5"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 h-8 px-2 justify-start"
                        onClick={() => {
                          handleTranslationDownload(code, content);
                          setShowTranslations(false);
                          setIsOpen(false);
                        }}
                        disabled={!!translationStatus}
                      >
                        <Globe className="w-3 h-3 mr-2" />
                        <span className="text-sm">{name}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleRegenerateTranslation(code)}
                        title="Regenerate translation"
                        disabled={!!translationStatus}
                      >
                        <RefreshCw className={cn(
                          "w-3 h-3",
                          translationStatus && code === selectedLanguage && "animate-spin"
                        )} />
                      </Button>
                    </div>
                  ))}

                  {/* Translation Progress */}
                  {translationStatus && (
                    <div className="mt-3 p-2 bg-muted rounded-md space-y-1">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="text-sm">
                          Translating... ({translationStatus.percentComplete}%)
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Chunk {translationStatus.currentChunk} of {translationStatus.totalChunks}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Using {translationStatus.model}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* New Translation Button */}
              <div className="px-4 py-2 border-t border-border">
                <button
                  className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted rounded-sm"
                  onClick={() => {
                    setShowTranslations(false);
                    // Show language selection menu
                    setShowLanguageSelect(true);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    <span>New Translation</span>
                  </div>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Language Selection Submenu */}
      <AnimatePresence>
        {isOpen && showLanguageSelect && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="fixed mt-2 w-72 rounded-md shadow-lg bg-popover border border-border"
            style={{ 
              position: 'fixed',
              top: 'auto',
              left: 'auto',
              transform: 'translate(calc(200% + 1rem), 0)',
              zIndex: 1001,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.1)' // Add subtle overlay
            }}
          >
            <div className="sticky top-0 bg-popover border-b border-border p-2 flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => {
                  if (!translationStatus) {
                    setShowLanguageSelect(false);
                    setShowTranslations(true); // Go back to translations menu instead of main menu
                  }
                }}
                disabled={!!translationStatus}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="font-medium">
                {translationStatus ? 'Translating...' : 'Select Language'}
              </span>
            </div>

            <div className="py-2">
              {/* Language Selection */}
              <div className={cn(
                "transition-opacity duration-200",
                translationStatus ? "opacity-50 pointer-events-none" : "opacity-100"
              )}>
                {TRANSLATION_LANGUAGES
                  .filter(lang => !availableTranslations.some(t => t.code === lang.code))
                  .map((lang) => (
                    <button
                      key={lang.code}
                      className="w-full flex items-center px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
                      onClick={() => handleNewTranslation(lang.code)}
                      disabled={!!translationStatus}
                    >
                      <Globe className="w-4 h-4 mr-2" />
                      <span>{lang.name}</span>
                    </button>
                  ))}
              </div>

              {/* Translation Progress */}
              {translationStatus && (
                <div className="p-4 border-t border-border">
                  <div className="p-2 bg-muted rounded-md space-y-1">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span className="text-sm">
                        Translating... ({translationStatus.percentComplete}%)
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Chunk {translationStatus.currentChunk} of {translationStatus.totalChunks}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Using {translationStatus.model}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Add storage management utilities
const STORAGE_KEY = 'transcriptionHistory';
const MAX_TRANSLATIONS_PER_ITEM = 5; // Limit number of translations per transcription

// Add storage utilities
const StorageUtils = {
  getStorageUsage: () => {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? new Blob([data]).size : 0;
  },

  cleanupOldTranslations: (history: any) => {
    return {
      ...history,
      items: history.items.map((item: any) => {
        if (item.result.metadata?.translations) {
          const translations = Object.entries(item.result.metadata.translations);
          if (translations.length > MAX_TRANSLATIONS_PER_ITEM) {
            // Keep only the most recent translations
            const recentTranslations = translations
              .slice(-MAX_TRANSLATIONS_PER_ITEM)
              .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
            
            return {
              ...item,
              result: {
                ...item.result,
                metadata: {
                  ...item.result.metadata,
                  translations: recentTranslations
                }
              }
            };
          }
        }
        return item;
      })
    };
  }
};

// Add debug component
const MetadataDebug: React.FC<{ metadata: any }> = ({ metadata }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setIsOpen(true)}>
        Show Metadata
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg p-4 max-w-2xl w-full max-h-[80vh] overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">Metadata Debug</h3>
          <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
            Close
          </Button>
        </div>
        <div className="space-y-2">
          <div>
            <strong>Storage Usage:</strong> {(StorageUtils.getStorageUsage() / 1024).toFixed(2)} KB
          </div>
          <pre className="bg-muted p-4 rounded-lg overflow-auto text-xs">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
};

// Add this helper function at file level, before any components
const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

const TranscriptionResults: React.FC<TranscriptionResultsProps> = ({ 
  result, 
  onRemove,
  className,
  onUpdate
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState(result.text)
  const [copySuccess, setCopySuccess] = useState('')
  const [isContentVisible, setIsContentVisible] = useState(true)
  const editorRef = useRef<any>(null)
  const [sections, setSections] = useState<TranscriptionSection[]>([])
  const [isAllExpanded, setIsAllExpanded] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [editedSections, setEditedSections] = useState<Record<string, string>>({})
  const [selectedRange, setSelectedRange] = useState<Range | null>(null)
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [localResult, setResult] = useState<TranscriptionResult>(result);

  // Add initial load logging
  useEffect(() => {
    if (result.metadata?.translations) {
      console.log('Initial translations:', {
        id: result.id,
        title: result.metadata.title,
        availableLanguages: Object.keys(result.metadata.translations).map(code => {
          const lang = TRANSLATION_LANGUAGES.find(l => l.code === code);
          return lang ? `${lang.name} (${code})` : code;
        })
      });
    }
  }, []); // Only run once on mount

  // Update visibility when prop changes
  useEffect(() => {
    setIsContentVisible(true)
  }, [result.id])

  // Toggle visibility with animation
  const toggleVisibility = () => {
    const newVisibility = !isContentVisible
    setIsContentVisible(newVisibility)
  }

  // Load saved preferences
  useEffect(() => {
    const savedPreferences = localStorage.getItem(`transcription-prefs-${result.id}`)
    if (savedPreferences) {
      const prefs = JSON.parse(savedPreferences)
      setIsContentVisible(prefs.isVisible)
      setShowPreview(prefs.showPreview)
      setIsAllExpanded(prefs.isAllExpanded)
    }
  }, [result.id])

  // Save preferences
  const savePreferences = useCallback(() => {
    const prefs = {
      isVisible: isContentVisible,
      showPreview,
      isAllExpanded,
      expandedSections: sections.reduce((acc, section) => {
        acc[section.id] = section.isExpanded
        return acc
      }, {} as Record<string, boolean>)
    }
    localStorage.setItem(`transcription-prefs-${result.id}`, JSON.stringify(prefs))
  }, [isContentVisible, showPreview, isAllExpanded, sections, result.id])

  // Split text into sections
  useEffect(() => {
    const splitText = (text: string): TranscriptionSection[] => {
      return text.match(new RegExp(`.{1,${SECTION_LENGTH}}(?=\\s|$)`, 'g'))?.map((text, index) => ({
        id: `section-${index}`,
        text: text.trim(),
        isExpanded: true
      })) || []
    }

    setSections(splitText(result.text))
    setIsAllExpanded(true)
  }, [result.text])

  // Toggle individual section
  const toggleSection = useCallback((id: string) => {
    setSections(prev => prev.map(section => 
      section.id === id 
        ? { ...section, isExpanded: !section.isExpanded }
        : section
    ))
  }, [])

  // Toggle all sections
  const toggleAllSections = useCallback(() => {
    const newState = !isAllExpanded
    setSections(prev => prev.map(section => ({
      ...section,
      isExpanded: newState
    })))
    setIsAllExpanded(newState)
  }, [isAllExpanded])

  // Add keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Alt/Option + H to toggle visibility
      if (e.altKey && e.key === 'h') {
        setIsContentVisible(prev => !prev)
      }
      // Alt/Option + A to toggle all sections
      if (e.altKey && e.key === 'a') {
        toggleAllSections()
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [toggleAllSections])

  // Save preferences when state changes
  useEffect(() => {
    savePreferences()
  }, [isContentVisible, showPreview, isAllExpanded, sections, savePreferences])

  // Handle text selection
  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection()
      if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
        setSelectedRange(selection.getRangeAt(0))
      } else {
        setSelectedRange(null)
      }
    }

    document.addEventListener('selectionchange', handleSelection)
    return () => document.removeEventListener('selectionchange', handleSelection)
  }, [])

  // Handle section edit
  const onSectionEdit = useCallback((sectionId: string, content: string) => {
    setEditedSections(prev => ({
      ...prev,
      [sectionId]: content
    }))
  }, [])

  // Smart copy function
  const handleCopy = async (format: 'plain' | 'formatted' = 'formatted') => {
    try {
      const content = sections
        .map(section => editedSections[section.id] || section.text)
        .join('\n\n')
      
      if (format === 'formatted' && editorRef.current) {
        await navigator.clipboard.writeText(content)
      } else {
        await navigator.clipboard.writeText(content)
      }
      setCopySuccess('Copied!')
      setTimeout(() => setCopySuccess(''), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
      setCopySuccess('Failed to copy')
    }
  }

  // Enhanced download function
  const handleDownload = async (format: DownloadFormat, targetLanguage?: string, onProgress?: (status: TranslationStatus) => void) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const title = localResult.metadata?.title?.replace(/[^a-z0-9]/gi, '_') || 'transcription';

    if (format === 'srt' && targetLanguage) {
      // Check for existing translation
      const translations = TranslationManager.getTranslations(result.id);
      
      if (translations[targetLanguage]) {
        // Use cached translation
        const content = translations[targetLanguage];
        const filename = `${title}-${targetLanguage}-${timestamp}.srt`;
        downloadFile(content, filename, 'application/x-subrip');
      } else if (localResult.metadata?.srtContent) {
        try {
          const translatedContent = await translateAndDownloadSRT(
            localResult.metadata.srtContent,
            title,
            targetLanguage,
            onProgress
          );
          
          if (translatedContent) {
            // Save translation
            TranslationManager.saveTranslation(result.id, targetLanguage, translatedContent);
            
            // Update local state with new translation
            const updatedResult = {
              ...localResult,
              metadata: {
                ...localResult.metadata,
                translations: {
                  ...(localResult.metadata?.translations || {}),
                  [targetLanguage]: translatedContent
                }
              }
            };
            
            // Update states
            setResult(updatedResult);
            onUpdate?.(updatedResult);

            // Download file
            const filename = `${title}-${targetLanguage}-${timestamp}.srt`;
            downloadFile(translatedContent, filename, 'application/x-subrip');
          }
        } catch (error) {
          console.error('Translation failed:', error);
          if (onProgress) {
            onProgress({
              currentChunk: 0,
              totalChunks: 0,
              percentComplete: 0,
              model: "gpt-4o-mini"
            });
          }
        }
        return;
      }
      return;
    }
    
    let content: string;
    let filename: string;
    let mimeType: string;

    switch (format) {
      case 'srt':
        // Use the SRT content directly from metadata
        if (!localResult.metadata?.srtContent) {
          console.error('No SRT content available');
          return;
        }
        content = localResult.metadata.srtContent;
        filename = `${title}-${timestamp}.srt`;
        mimeType = 'application/x-subrip';
        break;
        
      case 'markdown':
        content = generateMarkdown(sections, editedSections, localResult);
        filename = `${title}-${timestamp}.md`;
        mimeType = 'text/markdown';
        break;
        
      case 'txt':
        content = generatePlainText(sections, editedSections, localResult);
        filename = `${title}-${timestamp}.txt`;
        mimeType = 'text/plain';
        break;
        
      case 'html':
      default:
        const displayTitle = localResult.metadata?.title || 'Transcription';
        content = `<!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <title>${displayTitle}</title>
              <style>
                body { font-family: system-ui; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
                .metadata { color: #666; margin-bottom: 2rem; }
                .transcription { line-height: 1.6; }
                .section { margin-bottom: 1.5em; }
              </style>
            </head>
            <body>
              <div class="metadata">
                <h1>${displayTitle}</h1>
                <p>Date: ${new Date().toLocaleString()}</p>
                ${localResult.metadata?.language ? `<p>Language: ${localResult.metadata.language}</p>` : ''}
                ${localResult.metadata?.duration ? `<p>Duration: ${formatDuration(localResult.metadata.duration)}</p>` : ''}
                ${localResult.metadata?.confidence ? `<p>Confidence: ${(localResult.metadata.confidence * 100).toFixed(1)}%</p>` : ''}
              </div>
              <div class="transcription">
                ${sections.map(section => `
                  <div class="section">
                    ${editedSections[section.id] || section.text}
                  </div>
                `).join('')}
              </div>
            </body>
          </html>`;
        filename = `${title}-${timestamp}.html`;
        mimeType = 'text/html';
    }

    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  // Modify setIsEditing to handle section expansion
  const handleEditToggle = useCallback(() => {
    setIsEditing(prev => {
      const newIsEditing = !prev
      if (newIsEditing) {
        // Expand all sections when entering edit mode
        setSections(sections => sections.map(section => ({
          ...section,
          isExpanded: true
        })))
        setIsAllExpanded(true)
      }
      return newIsEditing
    })
  }, [])

  // Add this handleFormat function
  const handleFormat = useCallback((format: string) => {
    if (!editorRef.current) return;
    
    switch (format) {
      case 'bold':
        editorRef.current.chain().focus().toggleBold().run();
        break;
      case 'italic':
        editorRef.current.chain().focus().toggleItalic().run();
        break;
      case 'underline':
        editorRef.current.chain().focus().toggleUnderline().run();
        break;
    }
  }, [editorRef]);

  // Add this helper function
  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  // Update useEffect to sync with prop changes
  useEffect(() => {
    setResult(result);
  }, [result]);

  // Add debug logging for available translations
  useEffect(() => {
    if (localResult.metadata?.translations) {
      console.log('Available translations:', {
        languages: Object.keys(localResult.metadata.translations),
        result: localResult
      });
    }
  }, [localResult.metadata?.translations]);

  return (
    <div className={cn("space-y-4", className)}>
      <Card className="relative bg-card border-muted">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-2">
            <MetadataDebug metadata={localResult.metadata} />
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleEditToggle}
            >
              <Edit2 className="w-4 h-4 mr-2" />
              {isEditing ? 'View' : 'Edit'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleAllSections}
              className="text-xs"
            >
              {isAllExpanded ? (
                <>
                  <Minimize2 className="w-4 h-4 mr-1" />
                  Collapse All
                </>
              ) : (
                <>
                  <Maximize2 className="w-4 h-4 mr-1" />
                  Expand All
                </>
              )}
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleCopy('formatted')}
              className="relative"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy
              {copySuccess && (
                <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs py-1 px-2 rounded">
                  {copySuccess}
                </span>
              )}
            </Button>
            <DownloadMenu 
              onDownload={handleDownload}
              isOpen={isDownloadMenuOpen}
              setIsOpen={setIsDownloadMenuOpen}
              result={localResult}
            />
            {onRemove && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRemove}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {sections.map((section, index) => (
              <CollapsibleSection
                key={section.id}
                section={section}
                onToggle={toggleSection}
                isPreview={false}
                isEditing={isEditing}
                onSectionEdit={onSectionEdit}
                editorRef={editorRef}
                className="bg-card border-muted hover:border-muted-foreground/20"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Helper function to format timestamp
function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

export default function TranscriptionResultsWithErrorBoundary(props: TranscriptionResultsProps) {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <TranscriptionResults {...props} />
    </ErrorBoundary>
  )
} 