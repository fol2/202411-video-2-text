import { motion } from 'framer-motion';
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Moon, Sun } from "lucide-react"
import { useMediaQuery } from '@/hooks/use-media-query'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useState, useEffect } from 'react'

interface HeaderProps {
  theme: string | undefined;
  setTheme: (theme: string) => void;
  showDebug: boolean;
  setShowDebug: (show: boolean) => void;
  className?: string;
}

export { type HeaderProps };

export function Header({ theme, setTheme, showDebug, setShowDebug, className }: HeaderProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
  }, [])

  const titleWords = "Video to Text Transcription".split(" ")
  
  const container = {
    hidden: { opacity: 0 },
    visible: (i = 1) => ({
      opacity: 1,
      transition: { staggerChildren: 0.12, delayChildren: 0.04 * i },
    }),
  }
  
  const child = {
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        type: "spring",
        damping: 12,
        stiffness: 100,
      },
    },
    hidden: {
      opacity: 0,
      x: 20,
      transition: {
        type: "spring",
        damping: 12,
        stiffness: 100,
      },
    },
  }

  const themeLabel = mounted ? (theme === 'dark' ? 'Dark Mode' : 'Light Mode') : ''

  return (
    <motion.header 
      className={cn(
        "backdrop-blur-md z-50",
        className
      )}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <TooltipProvider>
        <div className="container mx-auto py-3">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="relative">
              <motion.h1 
                className="text-2xl md:text-3xl font-bold tracking-tight"
                variants={container}
                initial="hidden"
                animate="visible"
              >
                {titleWords.map((word, i) => (
                  <motion.span
                    variants={child}
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
              
              <motion.div
                className="absolute -bottom-1 left-0 h-[2px] bg-primary/30"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ delay: 0.5, duration: 0.8, ease: "easeOut" }}
              />
            </div>
            
            {isMobile ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  >
                    {mounted && (theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />)}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle theme</TooltipContent>
              </Tooltip>
            ) : (
              <motion.div 
                className="flex items-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-accent/50 hover:bg-accent/70 transition-colors">
                      <Label htmlFor="dark-mode" className="text-sm cursor-pointer select-none">
                        {themeLabel}
                      </Label>
                      <Switch
                        id="dark-mode"
                        checked={theme === 'dark'}
                        onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                        className="data-[state=checked]:bg-primary transition-all duration-200"
                      >
                        <div className="flex items-center justify-center w-full h-full">
                          <motion.div
                            initial={false}
                            animate={{ rotate: theme === 'dark' ? 180 : 0 }}
                            transition={{ duration: 0.3 }}
                          >
                            {mounted && (theme === 'dark' ? (
                              <Moon className="h-3 w-3" />
                            ) : (
                              <Sun className="h-3 w-3" />
                            ))}
                          </motion.div>
                        </div>
                      </Switch>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Adjust visual theme</TooltipContent>
                </Tooltip>
              </motion.div>
            )}
          </div>
        </div>
      </TooltipProvider>
    </motion.header>
  );
} 