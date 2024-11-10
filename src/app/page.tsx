'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from "next-themes"
import { useMediaQuery } from '@/hooks/use-media-query'
import { useToast } from "@/components/ui/use-toast"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Loader2, Moon, Sun, Clock, Upload } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

import VideoTranscription from '@/components/template/video-transcription'
import TranscriptionHistory from '@/components/TranscriptionHistory'
import { TranscriptionResult } from '@/types/transcription'
import HistoryManager from '@/lib/historyManager'
import { cn } from '@/lib/utils'

export default function EnhancedTranscriptionPage() {
  const [showDebug, setShowDebug] = useState(false)
  const [activeTab, setActiveTab] = useState('transcribe')
  const { toast } = useToast()
  const [history, setHistory] = useState<ReturnType<typeof HistoryManager.createEmpty>>({
    version: 2,
    items: [],
    lastUpdated: new Date().toISOString()
  })
  const [newItemId, setNewItemId] = useState<string | null>(null)
  const { theme, setTheme } = useTheme()
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [showSuccess, setShowSuccess] = useState(false)
  const [shortcutsEnabled, setShortcutsEnabled] = useState(true)
  const [isFirstVisit, setIsFirstVisit] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [hasAnimated, setHasAnimated] = useState(false)
  const [osShortcut, setOsShortcut] = useState('Alt'); // Default to Alt

  const isDesktop = useMediaQuery("(min-width: 768px)")
  const isMac = typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0

  useEffect(() => {
    setMounted(true)
    setHistory(HistoryManager.load())
    const hasVisited = localStorage.getItem('hasVisited')
    if (!hasVisited) {
      localStorage.setItem('hasVisited', 'true')
    } else {
      setIsFirstVisit(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'history') {
      setHistory(HistoryManager.load())
    }
  }, [activeTab])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (HistoryManager.hasLegacyData()) {
        console.log('Found legacy data, migrating...')
        if (HistoryManager.forceMigrateLegacy()) {
          console.log('Migration successful')
          if (HistoryManager.cleanupDuplicates()) {
            setHistory(HistoryManager.load())
            toast({
              title: "History Cleaned Up",
              description: "Duplicate transcriptions have been removed.",
            })
          }
        }
      } else if (HistoryManager.cleanupDuplicates()) {
        setHistory(HistoryManager.load())
      }
    }
  }, [toast])

  useEffect(() => {
    const interval = setInterval(() => {
      if (activeTab === 'history') {
        const currentHistory = HistoryManager.load()
        setHistory(currentHistory)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [activeTab])

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      console.log('Key pressed:', {
        key: e.key,
        alt: e.altKey,
        meta: e.metaKey,
        enabled: shortcutsEnabled,
        isMac: isMac
      });

      if (!shortcutsEnabled || 
          e.target instanceof HTMLInputElement || 
          e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.altKey) {
        e.preventDefault();
        
        switch (e.key.toLowerCase()) {
          case '1':
            setActiveTab('transcribe');
            showShortcutFeedback('Switched to Transcribe tab');
            break;
          case '2':
            setActiveTab('history');
            showShortcutFeedback('Switched to History tab');
            break;
          case 'd':
            setShowDebug(prev => !prev);
            showShortcutFeedback(`Debug mode ${showDebug ? 'disabled' : 'enabled'}`);
            break;
          case 'w':
            setIsFirstVisit(prev => !prev);
            showShortcutFeedback(`Welcome guide ${isFirstVisit ? 'hidden' : 'shown'}`);
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [shortcutsEnabled, isMac, setActiveTab, setShowDebug, showDebug, isFirstVisit, toast]);

  useEffect(() => {
    console.log('Shortcuts enabled:', shortcutsEnabled);
    console.log('Active tab:', activeTab);
    console.log('Debug mode:', showDebug);
    console.log('First visit:', isFirstVisit);
  }, [shortcutsEnabled, activeTab, showDebug, isFirstVisit]);

  useEffect(() => {
    if (!hasAnimated) {
      setHasAnimated(true)
    }
  }, [])

  useEffect(() => {
    const isMacOS = typeof window !== 'undefined' && 
      navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    setOsShortcut(isMacOS ? '⌥' : 'Alt');
  }, []);

  const handleTranscriptionComplete = (result: TranscriptionResult) => {
    setIsLoading(false)
    setShowSuccess(true)
    setTimeout(() => setShowSuccess(false), 1500)
    
    try {
      setHistory(HistoryManager.load())
      setActiveTab('history')
      setNewItemId(result.id)
      
      toast({
        title: "Transcription Complete",
        description: "Your transcription has been saved to history.",
      })
    } finally {
      setTimeout(() => setNewItemId(null), 3000)
    }
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
    const currentHistory = HistoryManager.load()
    const updatedHistory = {
      ...currentHistory,
      items: currentHistory.items.map(item => 
        ids.includes(item.id)
          ? { ...item, isDeleted: true, deletedAt: new Date().toISOString() }
          : item
      )
    }
    
    if (HistoryManager.save(updatedHistory)) {
      setHistory(updatedHistory)
      toast({
        title: "Transcription Moved to Trash",
        description: `${ids.length} transcription(s) moved to trash.`,
      })
    } else {
      toast({
        title: "Error",
        description: "Failed to delete transcription(s). Please try again.",
        variant: "destructive",
      })
    }
  }

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
      localStorage.clear()
      const emptyHistory = HistoryManager.createEmpty()
      setHistory(emptyHistory)
      toast({
        title: "Storage Reset",
        description: "All storage has been cleared successfully.",
        variant: "default",
      })
      window.location.reload()
    } catch (error) {
      console.error('Failed to reset storage:', error)
      toast({
        title: "Reset Failed",
        description: "Failed to reset storage. Please try again.",
        variant: "destructive",
      })
    }
  }, [toast])

  const pageTransitions = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
    transition: { 
      duration: 0.3,
      ease: 'easeInOut'
    }
  }

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
  }

  const keyboardShortcuts = [
    { key: `${osShortcut} + 1`, action: 'Switch to Transcribe tab' },
    { key: `${osShortcut} + 2`, action: 'Switch to History tab' },
    { key: `${osShortcut} + D`, action: 'Toggle Debug mode' },
    { key: `${osShortcut} + W`, action: 'Toggle Welcome Guide' }
  ]

  const WelcomeGuide = () => {
    const steps = [
      { icon: "📁", text: "Upload a video file" },
      { icon: "🔗", text: "Or paste a YouTube link" },
      { icon: "✨", text: "Get clean, formatted text" }
    ];

    const shortcuts = [
      { icon: "⌨️", text: `Press ${osShortcut} + 1/2 to switch tabs` },
      { icon: "🎯", text: `Press ${osShortcut} + D for debug mode` },
      { icon: "💡", text: `Press ${osShortcut} + W for this guide` }
    ];

    const features = [
      { icon: "🎥", text: "Supports MP4, WebM, OGG videos" },
      { icon: "🌐", text: "Multiple language support" },
      { icon: "📝", text: "Edit and format transcriptions" }
    ];

    const handleDismiss = () => {
      setIsFirstVisit(false);
      toast({
        title: "Welcome Guide Dismissed",
        description: "You can always bring it back with Alt + W",
        duration: 3000,
      });
    };

    const GridSection = ({ title, items, startDelay = 0 }: { 
      title: string, 
      items: { icon: string, text: string }[], 
      startDelay?: number 
    }) => (
      <div className="space-y-6">
        <h3 className="text-lg font-medium text-foreground/80">{title}</h3>
        <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-2 text-center"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.5, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{
                  duration: 0.3,
                  delay: startDelay + (i * 0.1),
                  ease: [0.4, 0, 0.2, 1]
                }}
              >
                <span className="text-3xl">{item.icon}</span>
                <span className="text-sm text-muted-foreground block mt-2">{item.text}</span>
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    );

    return (
      <div className="space-y-8 text-center mb-8">
        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
          Turn Videos into Text
        </h2>

        <GridSection title="Getting Started" items={steps} startDelay={0.2} />
        <GridSection title="Keyboard Shortcuts" items={shortcuts} startDelay={0.5} />
        <GridSection title="Features" items={features} startDelay={0.8} />

        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Click here to dismiss
        </Button>
      </div>
    );
  };

  const LoadingSkeleton = () => (
    <div className="space-y-4 w-full">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-32 w-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  )

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
  )

  const BackgroundGradient = () => (
    <div className="fixed inset-0 -z-10">
      <div
        className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background"
      />
    </div>
  )

  const TranscriptionProgress = ({ progress }: { progress: number }) => {
    const steps = [
      { label: "Uploading", target: 25 },
      { label: "Processing", target: 50 },
      { label: "Transcribing", target: 75 },
      { label: "Finalizing", target: 100 }
    ]

    const currentStep = steps.findIndex(step => progress <= step.target)

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
    )
  }

  const Header = () => {
    const titleWords = "Video to Text Transcription".split(" ")
    
    return (
      <header className="sticky top-0 backdrop-blur-md z-50 bg-background/95 py-4 px-6 mb-6 shadow-sm">
        <div className="container mx-auto">
          <div className="flex justify-between items-center">
            <div className="relative">
              <motion.h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                {titleWords.map((word, i) => (
                  <motion.span
                    key={i}
                    className={cn(
                      "inline-block mr-2",
                      "bg-clip-text text-transparent bg-gradient-to-r",
                      i === 0 ? "from-primary via-primary to-primary/80" : 
                      i === 1 ? "from-primary/90 via-primary/80 to-primary/70" :
                      "from-primary/80 via-primary/70 to-primary/60"
                    )}
                  >
                    {word}
                  </motion.span>
                ))}
              </motion.h1>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Mode Switch */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveTab(activeTab === 'transcribe' ? 'history' : 'transcribe')}
                className={cn(
                  "relative px-4 py-2 transition-all duration-200",
                  "hover:bg-accent/50"
                )}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {activeTab === 'transcribe' ? (
                    <motion.div 
                      key="history-button"
                      className="flex items-center gap-2"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Clock className="h-4 w-4" />
                      <span>View History</span>
                      {history.items.length > 0 && (
                        <Badge variant="secondary" className="ml-1">
                          {history.items.length}
                        </Badge>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="transcribe-button"
                      className="flex items-center gap-2"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Upload className="h-4 w-4" />
                      <span>New Transcription</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Button>

              {/* Theme Toggle */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                      className="rounded-full w-8 h-8"
                    >
                      <motion.div
                        initial={false}
                        animate={{ rotate: theme === 'dark' ? 180 : 0 }}
                      >
                        {mounted && (theme === 'dark' ? (
                          <Moon className="h-4 w-4" />
                        ) : (
                          <Sun className="h-4 w-4" />
                        ))}
                      </motion.div>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </header>
    )
  }

  const showShortcutFeedback = (action: string) => {
    // Clear any existing feedback timeout
    if (feedbackTimeout.current) {
      clearTimeout(feedbackTimeout.current);
    }

    toast({
      title: "Keyboard Shortcut Used",
      description: action,
      duration: 1500, // Auto-hide after 1.5 seconds
    });
  };

  // Add ref for feedback timeout
  const feedbackTimeout = useRef<NodeJS.Timeout>();

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (feedbackTimeout.current) {
        clearTimeout(feedbackTimeout.current);
      }
    };
  }, []);

  const handleEmptyTrash = () => {
    const history = HistoryManager.load()
    const updatedHistory = {
      ...history,
      items: history.items.filter(item => !item.isDeleted)
    }
    if (HistoryManager.save(updatedHistory)) {
      toast({
        title: "Trash emptied",
        description: "All deleted transcriptions have been permanently removed.",
      })
    }
  }

  return (
    <div className="min-h-screen grid grid-rows-[auto_1fr_auto] transition-all duration-200">
      <BackgroundGradient />
      <Header />
      
      <main className="container mx-auto px-4 pb-12">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="relative"
          >
            {activeTab === 'transcribe' ? (
              <>
                {isFirstVisit && <WelcomeGuide />}
                {isLoading ? (
                  <LoadingSkeleton />
                ) : (
                  <VideoTranscription 
                    showDebug={showDebug} 
                    onTranscriptionComplete={handleTranscriptionComplete}
                  />
                )}
              </>
            ) : (
              <div className="relative">
                <TranscriptionHistory
                  items={history.items}
                  onRestore={handleRestore}
                  onDelete={handleDelete}
                  onClearAll={handleClearAll}
                  onResetStorage={handleResetStorage}
                  onEmptyTrash={handleEmptyTrash}
                  newItemId={newItemId}
                />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer 
        className="py-4 text-center text-sm text-muted-foreground"
      >
        Built with Next.js and vid2cleantxt
      </footer>

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
                <button
                  key={key}
                  onClick={() => {
                    // Simulate the keyboard shortcut when clicked
                    const keyEvent = new KeyboardEvent('keydown', {
                      key: key.slice(-1).toLowerCase(), // Get the last character (1, 2, D, or W)
                      altKey: true,
                      bubbles: true
                    });
                    window.dispatchEvent(keyEvent);
                  }}
                  className={cn(
                    "w-full flex justify-between gap-4 items-center px-2 py-1 rounded-md",
                    "hover:bg-accent/50 transition-colors duration-200",
                    "cursor-pointer"
                  )}
                >
                  <kbd className={cn(
                    "px-2 py-1 bg-muted rounded text-xs font-mono",
                    isMac ? "font-medium" : "font-normal"
                  )}>
                    {key}
                  </kbd>
                  <span className="text-xs text-muted-foreground">{action}</span>
                </button>
              ))}
              <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                Click to {shortcutsEnabled ? 'disable' : 'enable'} shortcuts
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {showSuccess && <SuccessAnimation />}

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