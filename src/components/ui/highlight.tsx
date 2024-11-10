import { cn } from "@/lib/utils"

interface HighlightProps extends React.HTMLAttributes<HTMLSpanElement> {}

export function Highlight({ className, ...props }: HighlightProps) {
  return (
    <span
      className={cn(
        "bg-yellow-100 dark:bg-amber-500/30 text-yellow-900 dark:text-amber-50 rounded px-0.5",
        "font-medium relative",
        "dark:shadow-[0_0_2px_rgba(251,191,36,0.3)]",
        "dark:after:content-[''] dark:after:absolute dark:after:inset-0",
        "dark:after:bg-amber-400/10 dark:after:rounded",
        className
      )}
      {...props}
    />
  )
} 