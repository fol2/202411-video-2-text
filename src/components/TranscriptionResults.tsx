import React, { useState, useEffect, useRef, useCallback, memo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Copy, Download, Clock, Globe, CheckCircle2, Edit2, Eye, EyeOff, ChevronDown, ChevronRight, ChevronUp, Maximize2, Minimize2, X } from 'lucide-react'
import { TranscriptionResult } from '@/components/template/video-transcription'
import { ErrorBoundary, FallbackProps } from 'react-error-boundary'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

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
  result: TranscriptionResult
  isVisible?: boolean
  onVisibilityChange?: (visible: boolean) => void
  onRemove?: () => void
  className?: string
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
  className
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
          transition={{ duration: 0.2 }}
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

const TranscriptionResults: React.FC<TranscriptionResultsProps> = ({ 
  result, 
  isVisible: isVisibleProp = true,
  onVisibilityChange,
  onRemove,
  className
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState(result.text)
  const [copySuccess, setCopySuccess] = useState('')
  const [isContentVisible, setIsContentVisible] = useState(isVisibleProp)
  const editorRef = useRef<any>(null)
  const [sections, setSections] = useState<TranscriptionSection[]>([])
  const [isAllExpanded, setIsAllExpanded] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [editedSections, setEditedSections] = useState<Record<string, string>>({})
  const [selectedRange, setSelectedRange] = useState<Range | null>(null)

  // Update visibility when prop changes
  useEffect(() => {
    setIsContentVisible(isVisibleProp)
  }, [isVisibleProp])

  // Toggle visibility with animation
  const toggleVisibility = () => {
    const newVisibility = !isContentVisible
    setIsContentVisible(newVisibility)
    onVisibilityChange?.(newVisibility)
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
        isExpanded: false
      })) || []
    }

    setSections(splitText(result.text))
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
  const handleDownload = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `transcription-${timestamp}.html`
    
    const content = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Transcription</title>
          <style>
            body { font-family: system-ui; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
            .metadata { color: #666; margin-bottom: 2rem; }
            .transcription { line-height: 1.6; }
            .section { margin-bottom: 1.5em; }
          </style>
        </head>
        <body>
          <div class="metadata">
            <h1>Transcription</h1>
            <p>Date: ${new Date().toLocaleString()}</p>
            ${result.metadata?.language ? `<p>Language: ${result.metadata.language}</p>` : ''}
            ${result.metadata?.duration ? `<p>Duration: ${formatDuration(result.metadata.duration)}</p>` : ''}
            ${result.metadata?.confidence ? `<p>Confidence: ${(result.metadata.confidence * 100).toFixed(1)}%</p>` : ''}
          </div>
          <div class="transcription">
            ${sections.map(section => `
              <div class="section">
                ${editedSections[section.id] || section.text}
              </div>
            `).join('')}
          </div>
        </body>
      </html>
    `

    const blob = new Blob([content], { type: 'text/html;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  // Format duration helper
  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.floor(seconds % 60)
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

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

  return (
    <div className={cn("space-y-4", className)}>
      <Card className="relative bg-card border-muted">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg font-medium">Transcription Result</CardTitle>
          <div className="flex items-center gap-2">
            {isContentVisible && (
              <>
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
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleDownload}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </>
            )}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleVisibility}
                className="ml-2"
              >
                {isContentVisible ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </Button>
              {!isContentVisible && onRemove && (
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
          </div>
        </CardHeader>
        <CardContent>
          {isVisibleProp && (
            <div className="space-y-1">
              {sections.map((section, index) => (
                <CollapsibleSection
                  key={section.id}
                  section={section}
                  onToggle={toggleSection}
                  isPreview={!isVisibleProp}
                  isEditing={isEditing}
                  onSectionEdit={onSectionEdit}
                  editorRef={editorRef}
                  className="bg-card border-muted hover:border-muted-foreground/20"
                />
              ))}
            </div>
          )}
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