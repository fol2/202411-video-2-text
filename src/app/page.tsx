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
import { Loader2 } from "lucide-react"
import { cn } from '@/lib/utils'
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"

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
  const [isLoading, setIsLoading] = useState(false);

  // Add responsive state
  const isDesktop = useMediaQuery("(min-width: 768px)");

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

  // Add state for success animation
  const [showSuccess, setShowSuccess] = useState(false);

  // Single, combined handleTranscriptionComplete function
  const handleTranscriptionComplete = (result: TranscriptionResult) => {
    setIsLoading(false);
    
    // Show success animation
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 1500);
    
    try {
      setHistory(HistoryManager.load());
      setActiveTab('history');
      setNewItemId(result.id);
      
      toast({
        title: "Transcription Complete",
        description: "Your transcription has been saved to history.",
      });
    } finally {
      setTimeout(() => setNewItemId(null), 3000);
    }
  };

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
      scale: 0.95,
      filter: 'blur(4px)',
      transform: `translateX(${activeTab === 'history' ? '10%' : '-10%'})`
    },
    animate: { 
      opacity: 1, 
      scale: 1,
      filter: 'blur(0px)',
      transform: 'translateX(0%)',
      transition: {
        duration: 0.2,
        ease: [0.4, 0, 0.2, 1]
      }
    },
    exit: { 
      opacity: 0,
      scale: 0.95,
      filter: 'blur(4px)',
      transform: `translateX(${activeTab === 'history' ? '-10%' : '10%'})`,
      transition: {
        duration: 0.2,
        ease: [0.4, 0, 0.2, 1]
      }
    }
  };

  // Update the keyboard shortcuts implementation
  const [shortcutsEnabled, setShortcutsEnabled] = useState(true);

  // Update keyboard shortcuts handler
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only handle shortcuts if enabled and not in an input/textarea
      if (!shortcutsEnabled || 
          e.target instanceof HTMLInputElement || 
          e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Use Alt/Option key combinations instead
      if (e.altKey) {
        switch (e.key) {
          case '1':
            e.preventDefault();
            setActiveTab('transcribe');
            break;
          case '2':
            e.preventDefault();
            setActiveTab('history');
            break;
          case 'd':
            e.preventDefault();
            setShowDebug(prev => !prev);
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [shortcutsEnabled]);

  // Move OS detection to the top, before any usage
  const isMac = typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  // Then update keyboard shortcuts info
  const keyboardShortcuts = [
    { 
      key: isMac ? '⌥ 1' : 'Alt + 1', 
      action: 'Switch to Transcribe tab' 
    },
    { 
      key: isMac ? '⌥ 2' : 'Alt + 2', 
      action: 'Switch to History tab' 
    },
    { 
      key: isMac ? '⌥ D' : 'Alt + D', 
      action: 'Toggle Debug mode' 
    }
  ];

  const LoadingSkeleton = () => (
    <div className="space-y-4 w-full">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-32 w-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );

  const [isFirstVisit, setIsFirstVisit] = useState(true);

  useEffect(() => {
    const hasVisited = localStorage.getItem('hasVisited');
    if (!hasVisited) {
      localStorage.setItem('hasVisited', 'true');
    } else {
      setIsFirstVisit(false);
    }
  }, []);

  // Add new welcome animation component
  const WelcomeGuide = () => {
    const steps = [
      { icon: "📁", text: "Upload a video file" },
      { icon: "🔗", text: "Or paste a YouTube link" },
      { icon: "✨", text: "Get clean, formatted text" }
    ];

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6 text-center mb-8"
      >
        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
          Turn Videos into Text
        </h2>
        <div className="flex justify-center gap-8">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ 
                opacity: 1, 
                y: 0,
                transition: { delay: i * 0.2 }
              }}
              className="flex flex-col items-center gap-2"
            >
              <span className="text-3xl">{step.icon}</span>
              <span className="text-sm text-muted-foreground">{step.text}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    );
  };

  // Add progress state
  const [progress, setProgress] = useState(0);

  // Update loading state to show progress
  {isLoading && (
    <div className="space-y-4">
      <LoadingSkeleton />
      <div className="relative h-2 bg-muted rounded-full overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 bg-primary"
          initial={{ width: "0%" }}
          animate={{ 
            width: `${progress}%`,
            transition: { duration: 0.5 }
          }}
        />
      </div>
      <p className="text-sm text-center text-muted-foreground">
        Processing... {progress}%
      </p>
    </div>
  )}

  // Add success animation component
  const SuccessAnimation = () => (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ 
        scale: [0, 1.2, 1],
        rotate: [0, 20, -20, 0]
      }}
      className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50"
    >
      <div className="text-6xl">🎉</div>
    </motion.div>
  );

  // Add background gradient component
  const BackgroundGradient = () => (
    <div className="fixed inset-0 -z-10">
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background"
        animate={{
          opacity: [0.5, 0.8, 0.5],
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          repeatType: "reverse"
        }}
      />
    </div>
  );

  // Add new component for progress tracking
  const TranscriptionProgress = ({ progress }: { progress: number }) => {
    const steps = [
      { label: "Uploading", target: 25 },
      { label: "Processing", target: 50 },
      { label: "Transcribing", target: 75 },
      { label: "Finalizing", target: 100 }
    ];

    const currentStep = steps.findIndex(step => progress <= step.target);

    return (
      <div className="w-full max-w-md mx-auto">
        <div className="relative pt-8">
          <div className="absolute top-0 left-0 w-full h-1 bg-muted rounded-full">
            <motion.div
              className="absolute top-0 left-0 h-full bg-primary rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          
          <div className="flex justify-between">
            {steps.map((step, index) => (
              <div
                key={step.label}
                className="relative flex flex-col items-center"
              >
                <motion.div
                  className={cn(
                    "w-4 h-4 rounded-full",
                    "border-2 border-primary",
                    index <= currentStep ? "bg-primary" : "bg-background"
                  )}
                  animate={{
                    scale: index === currentStep ? [1, 1.2, 1] : 1
                  }}
                  transition={{ repeat: Infinity, duration: 2 }}
                />
                <span className="mt-2 text-xs text-muted-foreground">
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={cn(
      "min-h-screen relative",
      "grid grid-rows-[auto_1fr_auto]",
      "transition-all duration-200",
      isDesktop ? "px-6" : "px-2"
    )}>
      <BackgroundGradient />
      <Header 
        theme={theme}
        setTheme={setTheme}
        showDebug={showDebug}
        setShowDebug={setShowDebug}
        className="sticky top-0 bg-background/95 backdrop-blur-md z-50"
      />
      
      <motion.main 
        className={cn(
          "h-full overflow-hidden",
          isDesktop ? "py-6" : "py-3"
        )}
        {...pageTransitions}
      >
        <div className="h-full max-w-4xl mx-auto px-4">
          <Tabs 
            value={activeTab} 
            onValueChange={setActiveTab}
            className="h-full flex flex-col"
          >
            <TabsList className="grid w-full grid-cols-2 mt-5">
              <TabsTrigger 
                value="transcribe"
                className={cn(
                  "focus-visible:ring-2 focus-visible:ring-primary",
                  "transition-all duration-200",
                  "hover:scale-105 active:scale-95"
                )}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setActiveTab('transcribe');
                  }
                }}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </span>
                ) : (
                  "Transcribe"
                )}
              </TabsTrigger>
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
                      {isLoading ? (
                        <LoadingSkeleton />
                      ) : (
                        <>
                          {history.items.length === 0 && <WelcomeGuide />}
                          <div className="flex-1 flex flex-col">
                            <VideoTranscription 
                              showDebug={showDebug} 
                              onTranscriptionComplete={handleTranscriptionComplete}
                            />
                          </div>
                        </>
                      )}
                    </TabsContent>
                  )}

                  {activeTab === 'history' && (
                    <TabsContent 
                      value="history" 
                      className="h-full"
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
        className="py-2 text-center text-sm text-muted-foreground"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        Built with Next.js and vid2cleantxt
      </motion.footer>

      {isFirstVisit && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={cn(
            "absolute top-4 left-1/2 -translate-x-1/2",
            "bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg",
            "text-sm text-center max-w-md mx-auto z-50"
          )}
        >
          Welcome! Get started by uploading a video or pasting a YouTube link.
          <button
            onClick={() => setIsFirstVisit(false)}
            className="ml-2 opacity-70 hover:opacity-100"
          >
            ×
          </button>
        </motion.div>
      )}

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="fixed bottom-4 right-4 opacity-50 hover:opacity-100"
              onClick={() => setShortcutsEnabled(prev => !prev)}
            >
              <span className="flex items-center gap-2">
                ⌨️ Shortcuts {shortcutsEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="p-4">
            <div className="space-y-3">
              <div className="text-sm font-medium mb-2">
                Keyboard Shortcuts {shortcutsEnabled ? '(Enabled)' : '(Disabled)'}
              </div>
              {keyboardShortcuts.map(({ key, action }) => (
                <div key={key} className="flex justify-between gap-4 items-center">
                  <kbd className={cn(
                    "px-2 py-1 bg-muted rounded text-xs font-mono",
                    isMac ? "font-medium" : "font-normal"
                  )}>
                    {key}
                  </kbd>
                  <span className="text-xs text-muted-foreground">{action}</span>
                </div>
              ))}
              <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                Click to {shortcutsEnabled ? 'disable' : 'enable'} shortcuts
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {showSuccess && (
        <SuccessAnimation />
      )}

      {isLoading && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md">
            <TranscriptionProgress progress={progress} />
            <div className="mt-8 text-center">
              <LoadingSkeleton />
              <p className="mt-4 text-sm text-muted-foreground">
                Processing your video...
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
} 