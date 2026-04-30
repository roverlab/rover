import * as React from "react"
import { cn } from "../../lib/utils"

interface TooltipProps {
  children: React.ReactNode
  content: React.ReactNode
  side?: "top" | "bottom" | "left" | "right"
}

const Tooltip: React.FC<TooltipProps> = ({ children, content, side = "top" }) => {
  const [isVisible, setIsVisible] = React.useState(false)
  const tooltipRef = React.useRef<HTMLDivElement>(null)

  const sideClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  }

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          ref={tooltipRef}
          className={cn(
            "absolute z-50 px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground shadow-md whitespace-nowrap pointer-events-none",
            sideClasses[side]
          )}
        >
          {content}
        </div>
      )}
    </div>
  )
}

export { Tooltip }
