'use client'

import VideoTranscription from '@/components/template/video-transcription'
import TranscriptionHistory from '@/components/TranscriptionHistory'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TranscriptionResult } from '@/types/transcription'
import HistoryManager from '@/lib/historyManager'
import { useToast } from "@/components/ui/use-toast"
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"

export default function Home() {
  const [showDebug, setShowDebug] = useState(false)
  const [activeTab, setActiveTab] = useState('transcribe')
  const { toast } = useToast()
  const [history, setHistory] = useState<ReturnType<typeof HistoryManager.createEmpty>>({
    version: 2,
    items: [],
    lastUpdated: new Date().toISOString()
  })
  const [newItemId, setNewItemId] = useState<string | null>(null)
  const historyTabRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme()

  // Load history on client side only
  useEffect(() => {
    setHistory(HistoryManager.load())
  }, [])

  // Refresh history when tab becomes active
  useEffect(() => {
    if (activeTab === 'history') {
      setHistory(HistoryManager.load())
    }
  }, [activeTab])

  // Add effect to handle legacy data migration and cleanup
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // First handle legacy data
      if (HistoryManager.hasLegacyData()) {
        console.log('Found legacy data, migrating...');
        if (HistoryManager.forceMigrateLegacy()) {
          console.log('Migration successful');
          // After migration, clean up duplicates
          if (HistoryManager.cleanupDuplicates()) {
            setHistory(HistoryManager.load());
            toast({
              title: "History Cleaned Up",
              description: "Duplicate transcriptions have been removed.",
            });
          }
        }
      } else {
        // If no legacy data, still clean up any duplicates
        if (HistoryManager.cleanupDuplicates()) {
          setHistory(HistoryManager.load());
        }
      }
    }
  }, [toast]);

  const handleTranscriptionComplete = (result: TranscriptionResult) => {
    setHistory(HistoryManager.load()) // Refresh history
    setActiveTab('history') // Switch to history tab
    setNewItemId(result.id) // Set the new item ID for highlighting
    
    // Clear the highlight after animation
    setTimeout(() => {
      setNewItemId(null)
    }, 3000)

    toast({
      title: "Transcription Complete",
      description: "Your transcription has been saved to history.",
    })
  }

  const handleRestore = (item: TranscriptionResult) => {
    const history = HistoryManager.load()
    const updatedHistory = {
      ...history,
      items: history.items.map(historyItem => 
        historyItem.id === item.id 
          ? { ...historyItem, isDeleted: false, deletedAt: undefined }
          : historyItem
      )
    }
    if (HistoryManager.save(updatedHistory)) {
      setHistory(updatedHistory)
      toast({
        title: "Transcription Restored",
        description: "The transcription has been restored from trash.",
      })
    }
  }

  const handleDelete = (ids: string[]) => {
    const currentHistory = HistoryManager.load(); // Get fresh history
    const updatedHistory = {
      ...currentHistory,
      items: currentHistory.items.map(item => 
        ids.includes(item.id)
          ? { ...item, isDeleted: true, deletedAt: new Date().toISOString() }
          : item
      )
    };
    
    if (HistoryManager.save(updatedHistory)) {
      setHistory(updatedHistory);
      toast({
        title: "Transcription Moved to Trash",
        description: `${ids.length} transcription(s) moved to trash.`,
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to delete transcription(s). Please try again.",
        variant: "destructive",
      });
    }
  };

  // Add effect to periodically refresh history
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeTab === 'history') {
        const currentHistory = HistoryManager.load();
        setHistory(currentHistory);
      }
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, [activeTab]);

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to permanently delete all transcriptions? This cannot be undone.')) {
      const emptyHistory = HistoryManager.createEmpty()
      if (HistoryManager.save(emptyHistory)) {
        setHistory(emptyHistory)
        toast({
          title: "History Cleared",
          description: "All transcriptions have been permanently deleted.",
          variant: "destructive",
        })
      }
    }
  }

  const handleResetStorage = useCallback(() => {
    try {
      // Clear all localStorage keys
      localStorage.clear();
      
      // Reset history state
      const emptyHistory = HistoryManager.createEmpty();
      setHistory(emptyHistory);
      
      toast({
        title: "Storage Reset",
        description: "All storage has been cleared successfully.",
        variant: "default",
      });
      
      // Optionally reload the page to ensure clean state
      window.location.reload();
    } catch (error) {
      console.error('Failed to reset storage:', error);
      toast({
        title: "Reset Failed",
        description: "Failed to reset storage. Please try again.",
        variant: "destructive",
      });
    }
  }, [toast]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-center flex-1">
              Video to Text Transcription
            </h1>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="dark-mode" className="text-sm">Dark Mode</Label>
                <Switch
                  id="dark-mode"
                  checked={theme === 'dark'}
                  onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                  className="data-[state=checked]:bg-primary"
                >
                  <div className="flex items-center justify-center w-full h-full">
                    {theme === 'dark' ? (
                      <Moon className="h-3 w-3" />
                    ) : (
                      <Sun className="h-3 w-3" />
                    )}
                  </div>
                </Switch>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="debug-mode" className="text-sm">Debug Mode</Label>
                <Switch
                  id="debug-mode"
                  checked={showDebug}
                  onCheckedChange={setShowDebug}
                />
              </div>
            </div>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2 mb-8">
              <TabsTrigger value="transcribe">
                Transcribe
              </TabsTrigger>
              <TabsTrigger 
                value="history" 
                className="relative"
                asChild
              >
                <button ref={historyTabRef}>
                  History
                  <AnimatePresence>
                    {history.items.length > 0 && (
                      <motion.span
                        initial={{ scale: 1 }}
                        animate={{ 
                          scale: [1, 1.2, 1],
                          transition: { duration: 0.3, repeat: 2 }
                        }}
                        className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center"
                      >
                        {history.items.length}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="transcribe">
              <div className="mb-6 text-center">
                <p className="text-muted-foreground">
                  Upload a video file or paste a YouTube link to get started.
                  Powered by vid2cleantxt and OpenAI Whisper.
                </p>
              </div>
              
              <VideoTranscription 
                showDebug={showDebug} 
                onTranscriptionComplete={handleTranscriptionComplete}
              />
            </TabsContent>

            <TabsContent value="history">
              <TranscriptionHistory
                items={history.items}
                onRestore={handleRestore}
                onDelete={handleDelete}
                onClearAll={handleClearAll}
                onResetStorage={handleResetStorage}
                newItemId={newItemId}
              />
            </TabsContent>
          </Tabs>
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