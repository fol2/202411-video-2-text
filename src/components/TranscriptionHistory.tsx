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
  Edit2,
  Loader2,
  XCircle
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import { TranscriptionResult } from '@/types/transcription'
import HistoryManager, { HistoryV2 } from '@/lib/historyManager'
import TranscriptionResults from '@/components/TranscriptionResults'
import { Card, CardDescription } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useDebounce } from '@/hooks/useDebounce'
import { ScrollArea } from "@/components/ui/scroll-area"
import { Highlight } from "@/components/ui/highlight"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface TranscriptionHistoryProps {
  items: HistoryV2['items']
  onRestore: (item: TranscriptionResult) => void
  onDelete: (ids: string[]) => void
  onClearAll: () => void
  onResetStorage: () => void
  onEmptyTrash: () => void
  newItemId?: string | null;
}

interface TranscriptionEntry {
  id: string;
  timestamp: string;
  text: string;
  title?: string;
  youtubeLink?: string;
}

interface SearchResultMatch {
  field: string;
  text: string;
  highlight: [number, number][];
  prefix?: string;
  suffix?: string;
  score?: number;
  type?: 'exact' | 'partial' | 'proximity' | 'individual';
}

interface SearchResult {
  id: string;
  matches: SearchResultMatch[];
}

// Move helper functions before the component
const getTextContext = (text: string, matchPosition: number, contextLength: number = 50) => {
  const start = Math.max(0, matchPosition - contextLength)
  const end = Math.min(text.length, matchPosition + contextLength)
  
  return {
    text: text.slice(start, end),
    offset: start,
    prefix: start > 0 ? '...' : '',
    suffix: end < text.length ? '...' : ''
  }
}

// Add new component for settings menu
const SettingsMenu = ({ 
  onClearAll, 
  onResetStorage,
  onEmptyTrash,
  showDeleted 
}: { 
  onClearAll: () => void, 
  onResetStorage: () => void,
  onEmptyTrash: () => void,
  showDeleted: boolean
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
          {!showDeleted && (
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
          )}
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
                variant={action === 'clear' ? 'default' : 'destructive'}
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

// Add these utility functions at the top
const tokenizeSearchTerm = (term: string): string[] => {
  return term.toLowerCase().split(/\s+/).filter(Boolean)
}

const normalizeText = (text: string): string => {
  return text.toLowerCase().trim()
}

// Add scoring interface
interface SearchMatch {
  start: number;
  end: number;
  type: 'exact' | 'partial' | 'proximity' | 'individual';
  score: number;
}

// Update the searchField function
const searchField = (text: string | undefined, fieldName: string, fieldType: string | undefined, searchTerm: string): SearchResultMatch[] => {
  if (!text) return []
  const normalizedText = text.toLowerCase()
  const searchTerms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean)
  const fullPhrase = searchTerms.join(' ')
  const matches: SearchMatch[] = []
  const resultMatches: SearchResultMatch[] = []

  // 1. Try exact phrase match (highest priority)
  let pos = 0
  while ((pos = normalizedText.indexOf(fullPhrase, pos)) !== -1) {
    matches.push({
      start: pos,
      end: pos + fullPhrase.length,
      type: 'exact',
      score: 1.0
    })
    pos += 1
  }

  // 2. Try partial phrases (if multiple words)
  if (searchTerms.length > 1) {
    for (let i = 0; i < searchTerms.length - 1; i++) {
      const partialPhrase = searchTerms.slice(i, i + 2).join(' ')
      pos = 0
      while ((pos = normalizedText.indexOf(partialPhrase, pos)) !== -1) {
        matches.push({
          start: pos,
          end: pos + partialPhrase.length,
          type: 'partial',
          score: 0.8
        })
        pos += 1
      }
    }
  }

  // 3. Check for proximity matches
  if (searchTerms.length > 1) {
    const wordPositions = searchTerms.map(term => {
      const positions: number[] = []
      pos = 0
      while ((pos = normalizedText.indexOf(term, pos)) !== -1) {
        positions.push(pos)
        pos += term.length
      }
      return { term, positions }
    })

    // Find words that appear close to each other
    const maxDistance = 50 // characters
    for (let i = 0; i < wordPositions[0].positions.length; i++) {
      const startPos = wordPositions[0].positions[i]
      let found = true
      let endPos = startPos

      for (let j = 1; j < wordPositions.length; j++) {
        const nextWord = wordPositions[j]
        const nearbyPos = nextWord.positions.find(
          (pos: number) => pos > endPos && pos - endPos <= maxDistance
        )
        if (!nearbyPos) {
          found = false
          break
        }
        endPos = nearbyPos + nextWord.term.length
      }

      if (found) {
        matches.push({
          start: startPos,
          end: endPos,
          type: 'proximity',
          score: 0.6
        })
      }
    }
  }

  // 4. Individual word matches (lowest priority)
  searchTerms.forEach((term: string) => {
    pos = 0
    while ((pos = normalizedText.indexOf(term, pos)) !== -1) {
      // Only add if not already covered by a higher-priority match
      const isOverlapping = matches.some(m => 
        (pos >= m.start && pos <= m.end) ||
        (pos + term.length >= m.start && pos + term.length <= m.end)
      )
      if (!isOverlapping) {
        matches.push({
          start: pos,
          end: pos + term.length,
          type: 'individual',
          score: 0.4
        })
      }
      pos += 1
    }
  })

  if (matches.length > 0) {
    // Sort matches by position and remove overlaps, keeping higher scores
    const uniqueMatches = matches
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score
        return a.start - b.start
      })
      .reduce((acc: SearchMatch[], match) => {
        const overlaps = acc.some(m => 
          (match.start >= m.start && match.start <= m.end) ||
          (match.end >= m.start && match.end <= m.end)
        )
        if (!overlaps) acc.push(match)
        return acc
      }, [])

    if (fieldType === 'content') {
      // Group nearby matches into contexts
      const contexts = findBestContexts(text, uniqueMatches)
      contexts.forEach(context => {
        resultMatches.push({
          field: fieldName,
          text: context.text,
          highlight: context.highlights,
          prefix: context.prefix,
          suffix: context.suffix,
          score: context.score,
          type: uniqueMatches[0].type // Use the highest scoring match type
        })
      })
    } else {
      resultMatches.push({
        field: fieldName,
        text: text,
        highlight: uniqueMatches.map(m => [m.start, m.end] as [number, number]),
        score: Math.max(...uniqueMatches.map(m => m.score)),
        type: uniqueMatches[0].type
      })
    }
  }

  return resultMatches
}

// Update the findBestContexts function
const findBestContexts = (
  text: string,
  matches: SearchMatch[],
  contextLength: number = 100
) => {
  // Group matches that are close to each other
  const contexts: Array<{
    start: number;
    end: number;
    matches: SearchMatch[];
    score: number;
  }> = []

  let currentContext = {
    start: matches[0]?.start ?? 0,
    end: matches[0]?.end ?? 0,
    matches: [matches[0]],
    score: matches[0]?.score ?? 0
  }

  matches.slice(1).forEach(match => {
    if (match.start - currentContext.end <= contextLength) {
      currentContext.end = match.end
      currentContext.matches.push(match)
      currentContext.score += match.score
    } else {
      contexts.push(currentContext)
      currentContext = {
        start: match.start,
        end: match.end,
        matches: [match],
        score: match.score
      }
    }
  })
  contexts.push(currentContext)

  return contexts.map(context => {
    const contextStart = Math.max(0, context.start - contextLength / 2)
    const contextEnd = Math.min(text.length, context.end + contextLength / 2)
    
    return {
      text: text.slice(contextStart, contextEnd),
      highlights: context.matches.map(m => 
        [m.start - contextStart, m.end - contextStart] as [number, number]
      ),
      prefix: contextStart > 0 ? '...' : '',
      suffix: contextEnd < text.length ? '...' : '',
      score: context.score
    }
  })
}

// Define scoring layers
interface LayeredScore {
  layer1: number; // Exact phrase matches
  layer2: number; // Partial phrase matches
  layer3: number; // Proximity/multiple word matches
  layer4: number; // Individual word matches
  layer5: number; // Metadata matches
}

const SCORE_WEIGHTS = {
  LAYER1: {
    TITLE: 1000,
    CONTENT: 800,
    POSITION_BONUS: 50
  },
  LAYER2: {
    TITLE: 500,
    CONTENT: 400,
    POSITION_BONUS: 25
  },
  LAYER3: {
    TITLE: 200,
    CONTENT: 150,
    POSITION_BONUS: 10
  },
  LAYER4: {
    TITLE: 50,
    CONTENT: 40,
    POSITION_BONUS: 5
  },
  LAYER5: {
    LANGUAGE: 30,
    URL: 20,
    OTHER: 10
  }
} as const

// Update the score calculation
const calculateScore = (results: SearchResult | undefined): LayeredScore => {
  if (!results) {
    return {
      layer1: 0,
      layer2: 0,
      layer3: 0,
      layer4: 0,
      layer5: 0
    }
  }

  const scores: LayeredScore = {
    layer1: 0,
    layer2: 0,
    layer3: 0,
    layer4: 0,
    layer5: 0
  }

  results.matches.forEach(match => {
    if (match.field === 'Title' || match.field === 'Content') {
      const isTitle = match.field === 'Title'
      const positionBonus = match.highlight.some(([start]) => 
        start < (isTitle ? 20 : 100)
      ) ? (isTitle ? SCORE_WEIGHTS.LAYER1.POSITION_BONUS : SCORE_WEIGHTS.LAYER1.POSITION_BONUS / 2) : 0

      if (match.type === 'exact') {
        const score = isTitle ? SCORE_WEIGHTS.LAYER1.TITLE : SCORE_WEIGHTS.LAYER1.CONTENT
        scores.layer1 = Math.max(scores.layer1, score + positionBonus)
      } else if (match.type === 'partial') {
        const score = isTitle ? SCORE_WEIGHTS.LAYER2.TITLE : SCORE_WEIGHTS.LAYER2.CONTENT
        scores.layer2 = Math.max(scores.layer2, score + positionBonus)
      } else if (match.type === 'proximity') {
        const score = isTitle ? SCORE_WEIGHTS.LAYER3.TITLE : SCORE_WEIGHTS.LAYER3.CONTENT
        scores.layer3 = Math.max(scores.layer3, score + positionBonus)
      } else if (match.type === 'individual') {
        const score = isTitle ? SCORE_WEIGHTS.LAYER4.TITLE : SCORE_WEIGHTS.LAYER4.CONTENT
        scores.layer4 = Math.max(scores.layer4, score + positionBonus)
      }
    } else {
      // Metadata matches go to layer 5
      const score = match.field === 'Language' ? SCORE_WEIGHTS.LAYER5.LANGUAGE :
                   match.field === 'YouTube URL' ? SCORE_WEIGHTS.LAYER5.URL :
                   SCORE_WEIGHTS.LAYER5.OTHER
      scores.layer5 = Math.max(scores.layer5, score)
    }
  })

  return scores
}

const TranscriptionHistory: React.FC<TranscriptionHistoryProps> = ({
  items,
  onRestore,
  onDelete,
  onClearAll,
  onResetStorage,
  onEmptyTrash,
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
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const debouncedSearchTerm = useDebounce(searchTerm, 300)
  const [isEmptyTrashDialogOpen, setIsEmptyTrashDialogOpen] = useState(false)
  const [transcriptions, setTranscriptions] = useState<TranscriptionResult[]>([]);

  // Update the filteredItems memo to properly sort results
  const filteredItems = useMemo(() => {
    const trimmedSearch = debouncedSearchTerm.trim().toLowerCase()
    setIsSearching(true)
    
    // Reset search if empty
    if (!trimmedSearch) {
      setIsSearching(false)
      setSearchResults([])
      return items.filter(item => showDeleted ? item.isDeleted : !item.isDeleted)
    }

    const results: SearchResult[] = []
    const searchableFields = [
      { key: 'text', label: 'Content', type: 'content' },
      { key: 'title', label: 'Title', path: ['metadata', 'title'] },
      { key: 'language', label: 'Language', path: ['metadata', 'language'] },
      { key: 'youtubeUrl', label: 'YouTube URL', path: ['metadata', 'youtubeUrl'] }
    ]

    // First, collect all matches
    const matchedItems = items
      .filter(item => showDeleted ? item.isDeleted : !item.isDeleted)
      .map(item => {
        const itemMatches: SearchResult['matches'] = []
        let hasMatches = false

        // Search in all fields (existing search logic)
        searchableFields.forEach(field => {
          if (field.path) {
            let value: any = item.result
            for (const key of field.path) {
              value = value?.[key]
            }
            if (typeof value === 'string') {
              const matches = searchField(value, field.label, field.type, trimmedSearch)
              if (matches.length > 0) {
                itemMatches.push(...matches)
              }
            }
          }
        })

        // Search in metadata object keys and values
        if (item.result.metadata) {
          Object.entries(item.result.metadata).forEach(([key, value]) => {
            if (!searchableFields.some(field => field.path?.includes(key))) {
              if (typeof value === 'string' || typeof value === 'number') {
                const matches = searchField(value.toString(), key, undefined, trimmedSearch)
                if (matches.length > 0) {
                  itemMatches.push(...matches)
                  hasMatches = true
                }
              }
            }
          })
        }

        if (hasMatches) {
          results.push({
            id: item.id,
            matches: itemMatches
          })
          return { item, matches: itemMatches }
        }
        return null
      })
      .filter((match): match is NonNullable<typeof match> => Boolean(match))

    // Update search results for highlighting
    setSearchResults(results)
    setIsSearching(false)

    // Sort matched items by layer scores
    const sortedItems = matchedItems
      .sort((a, b) => {
        const aScores = calculateScore(results.find(r => r.id === a.item.id))
        const bScores = calculateScore(results.find(r => r.id === b.item.id))
        
        // Compare each layer in order
        const layers: (keyof LayeredScore)[] = ['layer1', 'layer2', 'layer3', 'layer4', 'layer5']
        
        // First, check if items belong to different layers
        for (const layer of layers) {
          const aHasLayer = aScores[layer] > 0
          const bHasLayer = bScores[layer] > 0
          
          if (aHasLayer !== bHasLayer) {
            return bHasLayer ? 1 : -1 // Items with higher layer come first
          }
          
          if (aHasLayer && bHasLayer) {
            if (aScores[layer] !== bScores[layer]) {
              return bScores[layer] - aScores[layer]
            }
            // If scores are equal in this layer, continue to next layer
          }
        }
        
        return 0 // Keep original order if all scores are equal
      })
      .map(match => match.item) // Extract sorted items

    return sortedItems

  }, [items, debouncedSearchTerm, showDeleted])

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
    const container = document.querySelector('.custom-scrollbar') as HTMLElement
    if (container) {
      const width = container.getBoundingClientRect().width
      container.style.setProperty('--content-width', `${width}px`)
    }
  }, []) // Run once on mount

  // Add this helper component for search results
  const SearchHighlight: React.FC<{ 
    text: string; 
    matches: [number, number][]; 
    prefix?: string;
    suffix?: string;
  }> = ({ 
    text, 
    matches,
    prefix,
    suffix
  }) => {
    let lastIndex = 0
    const parts: JSX.Element[] = []

    if (prefix) {
      parts.push(<span key="prefix" className="text-muted-foreground">{prefix}</span>)
    }

    matches.forEach(([start, end], i) => {
      if (start > lastIndex) {
        parts.push(
          <span key={`text-${i}`}>
            {text.slice(lastIndex, start)}
          </span>
        )
      }
      parts.push(
        <Highlight key={`highlight-${i}`}>
          {text.slice(start, end)}
        </Highlight>
      )
      lastIndex = end
    })

    if (lastIndex < text.length) {
      parts.push(
        <span key="text-end">
          {text.slice(lastIndex)}
        </span>
      )
    }

    if (suffix) {
      parts.push(<span key="suffix" className="text-muted-foreground">{suffix}</span>)
    }

    return <>{parts}</>
  }

  const handleTranscriptionUpdate = (updatedResult: TranscriptionResult) => {
    setTranscriptions(prev => 
      prev.map(item => 
        item.id === updatedResult.id ? updatedResult : item
      )
    );
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Search and Actions Row */}
      <div className="flex items-center gap-4 sticky top-0 bg-background/80 backdrop-blur-sm z-10 pb-2 pr-[var(--scrollbar-width)]">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            type="text"
            placeholder="Search transcriptions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={cn(
              "pl-10 pr-10",
              "transition-all duration-200",
              "border-muted-foreground/20 focus:border-primary",
              searchTerm && "pr-16"
            )}
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
          )}
          {searchTerm && !isSearching && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}
          {searchTerm && filteredItems.length > 0 && (
            <div className="absolute right-12 top-1/2 transform -translate-y-1/2 text-sm text-muted-foreground">
              {filteredItems.length} results
            </div>
          )}
        </div>
        {showDeleted ? (
          <>
            <Dialog open={isEmptyTrashDialogOpen} onOpenChange={setIsEmptyTrashDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Empty Trash
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Empty Trash?</DialogTitle>
                  <DialogDescription>
                    This will permanently delete all items in trash. This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button 
                    variant="outline" 
                    onClick={() => setIsEmptyTrashDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    variant="destructive"
                    onClick={() => {
                      onEmptyTrash();
                      setIsEmptyTrashDialogOpen(false);
                    }}
                  >
                    Empty Trash
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleted(false)}
            >
              Hide Deleted
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleted(true)}
          >
            Show Deleted
          </Button>
        )}
        <SettingsMenu 
          onClearAll={onClearAll}
          onResetStorage={onResetStorage}
          onEmptyTrash={onEmptyTrash}
          showDeleted={showDeleted}
        />
      </div>

      {/* Transcription List */}
      <div className={cn(
        "space-y-4 custom-scrollbar",
        "overflow-y-auto max-h-[calc(100vh-16rem)]",
        "w-full sm:w-[95%] md:w-[90%] lg:w-[85%] mx-auto",
        "transition-all duration-300",
        "pb-1"
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
                {/* Make the Preview Header sticky */}
                <motion.div
                  layout="position"
                  className={cn(
                    "p-4 flex items-start gap-4 cursor-pointer",
                    "sticky top-[0.0rem] bg-card z-10", // Add sticky positioning
                    "border-b border-border", // Add border for visual separation
                    expandedItemId === item.id && "shadow-sm" // Optional: add shadow when expanded
                  )}
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
                            {searchResults.find(r => r.id === item.id)?.matches.find(m => m.field === 'Title') ? (
                              <SearchHighlight
                                text={item.result.metadata?.title || 'Untitled'}
                                matches={searchResults.find(r => r.id === item.id)?.matches.find(m => m.field === 'Title')?.highlight || []}
                              />
                            ) : (
                              <span>
                                {item.result.metadata?.title || 
                                 (item.result.metadata?.youtubeUrl ? 'YouTube Video' : 'Uploaded Video')}
                              </span>
                            )}
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
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <div className="text-sm line-clamp-2">
                          {searchResults.find(r => r.id === item.id) ? (
                            searchResults
                              .find(r => r.id === item.id)
                              ?.matches
                              .filter(match => match.field !== 'Title') // Exclude title from search results
                              .map((match, i) => (
                                <div key={i} className="text-sm mb-1 last:mb-0">
                                  <span className="text-muted-foreground font-medium mr-1">
                                    {match.field}:
                                  </span>
                                  <SearchHighlight 
                                    text={match.text} 
                                    matches={match.highlight}
                                    prefix={match.prefix}
                                    suffix={match.suffix}
                                  />
                                </div>
                              ))
                          ) : (
                            item.result.text
                          )}
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
                            className={preloadedItems.has(item.id) && expandedItemId !== item.id ? 'pointer-events-none' : ''}
                            onUpdate={handleTranscriptionUpdate}
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