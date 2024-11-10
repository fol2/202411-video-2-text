import React, { useState, useCallback, useMemo, useLayoutEffect, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { 
  Trash2, 
  Search, 
  Clock, 
  Globe, 
  Tag,
  FolderOpen,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
  Undo,
  AlertCircle,
  ChevronRight,
  RotateCcw,
  Youtube,
  Edit2
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { TranscriptionResult } from '@/types/transcription'
import HistoryManager, { HistoryV2 } from '@/lib/historyManager'
import TranscriptionResults from '@/components/TranscriptionResults'
import { Card, CardDescription } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface TranscriptionHistoryProps {
  items: HistoryV2['items']
  onRestore: (item: TranscriptionResult) => void
  onDelete: (ids: string[]) => void
  onClearAll: () => void
  onResetStorage: () => void
  newItemId?: string | null;
}

interface TranscriptionEntry {
  id: string;
  timestamp: string;
  text: string;
  title?: string;
  youtubeLink?: string;
}

// Add new component for settings menu
const SettingsMenu = ({ onClearAll, onResetStorage }: { 
  onClearAll: () => void, 
  onResetStorage: () => void 
}) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [action, setAction] = useState<'clear' | 'reset' | null>(null)

  const handleAction = () => {
    if (action === 'clear') {
      onClearAll()
    } else if (action === 'reset') {
      onResetStorage()
    }
    setIsDialogOpen(false)
    setAction(null)
  }

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
        >
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>History Settings</DialogTitle>
          <DialogDescription>
            Manage your transcription history
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <h3 className="font-medium">Clear History</h3>
            <p className="text-sm text-muted-foreground">
              Remove all transcriptions from history. They will still be available in trash.
            </p>
            <Button 
              variant="outline" 
              onClick={() => {
                setAction('clear')
                setIsDialogOpen(true)
              }}
              className="w-full justify-start text-left"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All History
            </Button>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium">Reset Storage</h3>
            <p className="text-sm text-muted-foreground">
              Reset all storage including history, trash, and preferences. This cannot be undone.
            </p>
            <Button 
              variant="outline"
              onClick={() => {
                setAction('reset')
                setIsDialogOpen(true)
              }}
              className="w-full justify-start text-left text-destructive hover:text-destructive"
            >
              <AlertCircle className="w-4 h-4 mr-2" />
              Reset All Storage
            </Button>
          </div>
        </div>
        {action && (
          <>
            <DialogHeader>
              <DialogTitle>
                {action === 'clear' ? 'Clear History?' : 'Reset All Storage?'}
              </DialogTitle>
              <DialogDescription>
                {action === 'clear' 
                  ? 'This will move all transcriptions to trash. You can restore them later.'
                  : 'This will permanently delete all data including history, trash, and preferences. This action cannot be undone.'
                }
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false)
                  setAction(null)
                }}
              >
                Cancel
              </Button>
              <Button
                variant={action === 'reset' ? 'destructive' : 'default'}
                onClick={handleAction}
              >
                {action === 'clear' ? 'Clear History' : 'Reset Storage'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function useMeasure<T extends HTMLElement>() {
  const [dimensions, setDimensions] = useState({ height: 0 })
  const ref = useRef<T>(null)

  useLayoutEffect(() => {
    if (ref.current) {
      const measure = () => {
        setDimensions({
          height: ref.current?.offsetHeight || 0
        })
      }

      measure()

      // Create ResizeObserver to watch for changes
      const resizeObserver = new ResizeObserver(measure)
      if (ref.current) {
        resizeObserver.observe(ref.current)
      }

      return () => {
        if (ref.current) {
          resizeObserver.unobserve(ref.current)
        }
      }
    }
  }, [])

  return [ref, dimensions] as const
}

// Add this type near the top of the file
type PreviewState = 'visible' | 'hiding' | 'hidden'

// 1. Update the suppressScroll function
const suppressScroll = (suppress: boolean) => {
  if (suppress) {
    document.documentElement.classList.add('overflow-clip')
    document.body.classList.add('overflow-clip')
  } else {
    document.documentElement.classList.remove('overflow-clip')
    document.body.classList.remove('overflow-clip')
  }
}

// 2. Add this hook after the useMeasure hook
function useAnimationScrollLock() {
  useEffect(() => {
    let timer: NodeJS.Timeout
    
    return () => {
      clearTimeout(timer)
      suppressScroll(false)
    }
  }, [])

  const lockScroll = useCallback(() => {
    suppressScroll(true)
    const timer = setTimeout(() => suppressScroll(false), 300) // Match animation duration
    return () => {
      clearTimeout(timer)
      suppressScroll(false)
    }
  }, [])

  return lockScroll
}

// Add this constant at the top of the file after imports
const SCROLLBAR_WIDTH = '6px' // Match this with the scrollbar width in globals.css

const TranscriptionHistory: React.FC<TranscriptionHistoryProps> = ({
  items,
  onRestore,
  onDelete,
  onClearAll,
  onResetStorage,
  newItemId,
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [showDeleted, setShowDeleted] = useState(false)
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false)
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [ref, { height }] = useMeasure<HTMLDivElement>()
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const [preloadedItems, setPreloadedItems] = useState<Set<string>>(new Set())
  const [previewStates, setPreviewStates] = useState<Record<string, PreviewState>>({})
  const lockScroll = useAnimationScrollLock()
  const [isAnimating, setIsAnimating] = useState(false)

  // Filter items based on search and deleted status
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = 
        item.result.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.result.metadata?.language?.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesDeletedState = showDeleted ? item.isDeleted : !item.isDeleted

      return matchesSearch && matchesDeletedState
    })
  }, [items, searchTerm, showDeleted])

  // Format duration helper
  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.floor(seconds % 60)
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  // Format date helper
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Add relative time formatter
  const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) {
      return 'just now';
    }
    
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    }
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    }
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) {
      return `${diffInDays}d ago`;
    }
    
    // If older than a week, show the actual date
    return formatDate(dateString);
  };

  // 3. Update the toggleExpand function in TranscriptionHistory
  const toggleExpand = useCallback((id: string) => {
    lockScroll()
    setExpandedItemId(prevId => prevId === id ? null : id)
  }, [lockScroll])

  const handleTitleEdit = (item: HistoryV2['items'][0], newTitle: string) => {
    const currentHistory = HistoryManager.load();
    
    // Update the title in the item's metadata
    const updatedHistory = {
      ...currentHistory,
      items: currentHistory.items.map(historyItem => 
        historyItem.id === item.id 
          ? { 
              ...historyItem, 
              result: { 
                ...historyItem.result, 
                metadata: { 
                  ...historyItem.result.metadata, 
                  title: newTitle 
                } 
              } 
            }
          : historyItem
      )
    };
    
    if (HistoryManager.save(updatedHistory)) {
      setEditingTitleId(null);
    }
  };

  // Preload next/prev items
  useEffect(() => {
    if (expandedItemId) {
      const currentIndex = filteredItems.findIndex(item => item.id === expandedItemId)
      const itemsToPreload = [
        filteredItems[currentIndex - 1]?.id,
        filteredItems[currentIndex + 1]?.id
      ].filter(Boolean) as string[]
      
      setPreloadedItems(prev => new Set([...prev, ...itemsToPreload]))
    }
  }, [expandedItemId, filteredItems])

  // Add this effect to manage preview states
  useEffect(() => {
    if (expandedItemId) {
      // Set all other items to hiding first
      setPreviewStates(prev => {
        const next = { ...prev }
        filteredItems.forEach(item => {
          if (item.id !== expandedItemId) {
            next[item.id] = 'hiding'
          }
        })
        return next
      })

      // After animation, set them to hidden
      const timer = setTimeout(() => {
        setPreviewStates(prev => {
          const next = { ...prev }
          filteredItems.forEach(item => {
            if (item.id !== expandedItemId) {
              next[item.id] = 'hidden'
            }
          })
          return next
        })
      }, 300) // Match this with animation duration

      return () => clearTimeout(timer)
    } else {
      // When collapsing, make all previews visible again
      setPreviewStates(prev => {
        const next = { ...prev }
        filteredItems.forEach(item => {
          next[item.id] = 'visible'
        })
        return next
      })
    }
  }, [expandedItemId, filteredItems])

  // Add this effect to measure and set initial width
  useEffect(() => {
    const container = document.querySelector('.custom-scrollbar')
    if (container) {
      const width = container.getBoundingClientRect().width
      container.style.setProperty('--content-width', `${width}px`)
    }
  }, []) // Run once on mount

  return (
    <div className="space-y-4 overflow-clip">
      {/* Search and Actions Row */}
      <div className="flex items-center gap-4 pr-[6px]">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            type="text"
            placeholder="Search transcriptions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDeleted(!showDeleted)}
        >
          {showDeleted ? 'Hide Deleted' : 'Show Deleted'}
        </Button>
        <SettingsMenu 
          onClearAll={onClearAll}
          onResetStorage={onResetStorage}
        />
      </div>

      {/* Transcription List - Add width-lock class during animation */}
      <div className={cn(
        "space-y-4 overflow-y-auto custom-scrollbar relative",
        isAnimating && "fixed-width"
      )}>
        <div className="pr-[6px]">
          {filteredItems.map((item, index) => (
            <motion.div
              key={item.id}
              initial={false}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              layout
            >
              <Card 
                className={cn(
                  "mb-4 transition-all duration-300",
                  "hover:shadow-md",
                  "dark:border-muted dark:hover:border-accent",
                  newItemId === item.id && "border-primary dark:border-primary",
                  item.isDeleted && "opacity-60"
                )}
              >
                {/* Preview Header */}
                <motion.div
                  layout="position"
                  className="p-4 flex items-start gap-4 cursor-pointer"
                  onClick={() => toggleExpand(item.id)}
                >
                  <div className="flex-shrink-0 pt-1">
                    {expandedItemId === item.id ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    {/* Title with YouTube link */}
                    <div className="flex items-center gap-2">
                      {editingTitleId === item.id ? (
                        <div className="flex-1">
                          <Input
                            autoFocus
                            defaultValue={item.result.metadata?.title || ''}
                            onBlur={(e) => handleTitleEdit(item, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleTitleEdit(item, e.currentTarget.value);
                              } else if (e.key === 'Escape') {
                                setEditingTitleId(null);
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="h-8 w-full bg-background border-blue-200 focus:border-blue-400 
                                      shadow-sm hover:shadow transition-all duration-200 text-base font-medium"
                            placeholder="Enter title..."
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <h3 
                            className="font-medium cursor-text hover:text-blue-600 hover:underline decoration-dotted
                                       transition-colors duration-200 group flex items-center gap-1 text-base"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTitleId(item.id);
                            }}
                          >
                            <span>
                              {item.result.metadata?.title || 
                               (item.result.metadata?.youtubeUrl ? 'YouTube Video' : 'Uploaded Video')}
                            </span>
                            <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                          </h3>
                          {item.result.metadata?.youtubeUrl && (
                            <a 
                              href={item.result.metadata.youtubeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-shrink-0 text-red-500 hover:text-red-600 transition-colors duration-200"
                              onClick={(e) => e.stopPropagation()}
                              title="View on YouTube"
                            >
                              <Youtube className="w-5 h-5" />
                            </a>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1" title={formatDate(item.createdAt)}>
                        <Clock className="w-4 h-4" />
                        {formatRelativeTime(item.createdAt)}
                      </span>
                      {item.result.metadata?.duration && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {formatDuration(item.result.metadata.duration)}
                        </span>
                      )}
                      {item.result.metadata?.language && (
                        <span className="flex items-center gap-1">
                          <Globe className="w-4 h-4" />
                          {item.result.metadata.language.toUpperCase()}
                        </span>
                      )}
                    </div>

                    {/* Preview Text */}
                    {!expandedItemId && (
                      <motion.div 
                        initial={false}
                        animate={{ 
                          height: previewStates[item.id] === 'hidden' ? 0 : 'auto',
                          opacity: previewStates[item.id] === 'visible' ? 1 : 0
                        }}
                        transition={{ 
                          duration: 0.3,
                          ease: "easeInOut"
                        }}
                        className="overflow-hidden"
                      >
                        <div className="text-sm line-clamp-2">
                          {item.result.text}
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {item.isDeleted ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRestore(item.result);
                        }}
                      >
                        <Undo className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete([item.id]);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </motion.div>

                {/* Expanded Content */}
                <AnimatePresence mode="wait">
                  {(expandedItemId === item.id || preloadedItems.has(item.id)) && (
                    <motion.div
                      layout
                      initial={expandedItemId !== item.id ? { height: 0, opacity: 0 } : false}
                      animate={expandedItemId === item.id ? { 
                        height: contentHeight || 'auto',
                        opacity: 1
                      } : { height: 0, opacity: 0 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ 
                        layout: { duration: 0.3 },
                        height: { duration: 0.3 },
                        opacity: { duration: 0.2 }
                      }}
                      className="overflow-hidden border-t border-border bg-background"
                      onAnimationStart={() => {
                        if (expandedItemId === item.id) {
                          suppressScroll(true)
                          setIsAnimating(true)
                        }
                      }}
                      onAnimationComplete={() => {
                        suppressScroll(false)
                        setIsAnimating(false)
                      }}
                    >
                      <motion.div
                        layout
                        ref={ref}
                        className={cn(
                          "origin-top",
                          expandedItemId !== item.id && 'invisible absolute'
                        )}
                      >
                        <div className="p-4">
                          <TranscriptionResults 
                            result={item.result}
                            defaultExpanded={true}
                            className={preloadedItems.has(item.id) && expandedItemId !== item.id ? 'pointer-events-none' : ''}
                          />
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          ))}

          {filteredItems.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? 'No transcriptions found' : 'No transcriptions yet'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TranscriptionHistory