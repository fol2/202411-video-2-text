import { motion } from 'framer-motion';
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Moon, Sun } from "lucide-react"
import { useMediaQuery } from '@/hooks/use-media-query'

interface HeaderProps {
  theme?: string;
  setTheme: (theme: string) => void;
  showDebug: boolean;
  setShowDebug: (show: boolean) => void;
}

export function Header({ theme, setTheme, showDebug, setShowDebug }: HeaderProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')

  return (
    <motion.header 
      className="border-b sticky top-0 bg-background/80 backdrop-blur-sm z-50"
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="container mx-auto py-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <motion.h1 
            className="text-2xl md:text-3xl font-bold text-center tracking-tight"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            Video to Text Transcription
          </motion.h1>
          
          <motion.div 
            className="flex items-center gap-4 flex-wrap justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex items-center gap-2">
              <Label htmlFor="dark-mode" className="text-sm hidden md:inline">
                {isMobile ? '' : 'Dark Mode'}
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
                    {theme === 'dark' ? (
                      <Moon className="h-3 w-3" />
                    ) : (
                      <Sun className="h-3 w-3" />
                    )}
                  </motion.div>
                </div>
              </Switch>
            </div>
            
            {!isMobile && (
              <div className="flex items-center gap-2">
                <Label htmlFor="debug-mode" className="text-sm">Debug Mode</Label>
                <Switch
                  id="debug-mode"
                  checked={showDebug}
                  onCheckedChange={setShowDebug}
                  className="transition-all duration-200"
                />
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </motion.header>
  );
} 