import React, { useState, useCallback, useMemo } from 'react'
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
  ChevronRight
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
import { HistoryV2 } from '@/lib/historyManager'
import TranscriptionResults from '@/components/TranscriptionResults'

interface TranscriptionHistoryProps {
  items: HistoryV2['items']
  onRestore: (item: TranscriptionResult) => void
  onDelete: (ids: string[]) => void
  onClearAll: () => void
  onResetStorage: () => void
  newItemId?: string | null;
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

  const toggleExpand = (id: string) => {
    setExpandedItemId(expandedItemId === id ? null : id);
  };

  return (
    <div className="space-y-4">
      {/* Search and Actions Row */}
      <div className="flex items-center gap-4">
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

      {/* Transcription List */}
      <div className="space-y-4">
        {filteredItems.map(item => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ 
              opacity: 1, 
              y: 0,
              scale: item.id === newItemId ? [1, 1.02, 1] : 1,
              backgroundColor: item.id === newItemId ? ['#ffffff', '#f3f4f6', '#ffffff'] : '#ffffff'
            }}
            transition={{
              duration: item.id === newItemId ? 2 : 0.2,
              repeat: item.id === newItemId ? 1 : 0
            }}
            exit={{ opacity: 0, y: -20 }}
            className={`border rounded-lg ${
              item.isDeleted ? 'bg-gray-50' : 'bg-white'
            }`}
          >
            {/* Preview Header */}
            <div 
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
                  <div className="text-sm line-clamp-2">
                    {item.result.text}
                  </div>
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
            </div>

            {/* Expanded Content */}
            <AnimatePresence>
              {expandedItemId === item.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden border-t"
                >
                  <TranscriptionResults result={item.result} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}

        {filteredItems.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            {searchTerm ? 'No transcriptions found' : 'No transcriptions yet'}
          </div>
        )}
      </div>
    </div>
  )
}

export default TranscriptionHistory