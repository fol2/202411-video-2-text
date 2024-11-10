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
import { Header } from '@/components/Header'
import { useMediaQuery } from '@/hooks/use-media-query'

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
  const historyTabRef = useRef<HTMLButtonElement>(null);
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

  // Add smooth transitions
  const pageTransitions = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
    transition: { 
      duration: 0.3,
      ease: 'easeInOut'
    }
  };

  // Update the tabContentTransitions
  const tabContentTransitions = {
    initial: { 
      opacity: 0, 
      x: activeTab === 'history' ? 20 : -20,
      position: 'absolute'
    },
    animate: { 
      opacity: 1, 
      x: 0,
      position: 'relative',
      transition: {
        duration: 0.15,
        ease: [0.4, 0, 0.2, 1]
      }
    },
    exit: { 
      opacity: 0, 
      x: activeTab === 'history' ? -20 : 20,
      position: 'absolute',
      transition: {
        duration: 0.15,
        ease: [0.4, 0, 0.2, 1]
      }
    }
  };

  // Add keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Alt + T for Transcribe tab
      if (e.altKey && e.key === 't') {
        setActiveTab('transcribe');
      }
      // Alt + H for History tab
      if (e.altKey && e.key === 'h') {
        setActiveTab('history');
      }
      // Alt + D for Debug mode
      if (e.altKey && e.key === 'd') {
        setShowDebug(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Remember last active tab
  useEffect(() => {
    const lastTab = localStorage.getItem('lastActiveTab');
    if (lastTab === 'transcribe' || lastTab === 'history') {
      setActiveTab(lastTab);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('lastActiveTab', activeTab);
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-background grid grid-rows-[auto_1fr_auto]">
      <Header 
        theme={theme}
        setTheme={setTheme}
        showDebug={showDebug}
        setShowDebug={setShowDebug}
      />
      
      <motion.main 
        className="h-full overflow-hidden"
        {...pageTransitions}
      >
        <div className="h-full max-w-4xl mx-auto px-4">
          <Tabs 
            value={activeTab} 
            onValueChange={setActiveTab}
            className="h-full flex flex-col"
          >
            <TabsList className="grid w-full grid-cols-2 mt-5">
              <TabsTrigger value="transcribe">Transcribe</TabsTrigger>
              <TabsTrigger value="history" className="relative">
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
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 relative mt-4">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeTab}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  variants={tabContentTransitions}
                  className="absolute inset-0"
                >
                  {activeTab === 'transcribe' && (
                    <TabsContent 
                      value="transcribe" 
                      className="h-full flex flex-col"
                      forceMount
                    >
                      <p className="text-muted-foreground text-center mb-4">
                        Upload a video file or paste a YouTube link to get started.
                        Powered by vid2cleantxt and OpenAI Whisper.
                      </p>
                      
                      <div className="flex-1 flex flex-col">
                        <VideoTranscription 
                          showDebug={showDebug} 
                          onTranscriptionComplete={handleTranscriptionComplete}
                        />
                      </div>
                    </TabsContent>
                  )}

                  {activeTab === 'history' && (
                    <TabsContent 
                      value="history" 
                      className="h-full overflow-auto"
                      forceMount
                    >
                      <TranscriptionHistory
                        items={history.items}
                        onRestore={handleRestore}
                        onDelete={handleDelete}
                        onClearAll={handleClearAll}
                        onResetStorage={handleResetStorage}
                        newItemId={newItemId}
                      />
                    </TabsContent>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </Tabs>
        </div>
      </motion.main>

      <motion.footer 
        className="border-t py-2 text-center text-sm text-muted-foreground"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        Built with Next.js and vid2cleantxt
      </motion.footer>
    </div>
  )
} 