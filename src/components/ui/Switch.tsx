import * as React from "react"
import { cn } from "../../lib/utils"

interface SwitchProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  /** 尺寸变体，默认 "default" */
  size?: "default" | "sm"
}

const sizeConfig = {
  default: {
    track: "h-[26px] w-[48px] p-[2px]",
    thumb: "h-5 w-5",
    thumbOn: "translate-x-[22px]",
  },
  sm: {
    track: "h-[20px] w-[36px] p-[1.5px]",
    thumb: "h-[14px] w-[14px]",
    thumbOn: "translate-x-[16px]",
  },
} as const

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, onCheckedChange, disabled, size = "default", ...props }, ref) => {
    const cfg = sizeConfig[size]
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onCheckedChange?.(!checked)}
        className={cn(
          "peer inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
          cfg.track,
          checked
            ? "switch-enhanced"
            : "bg-[#e9eef8] dark:bg-[#1e293b] shadow-[inset_0_2px_5px_rgba(23,41,77,0.08)] dark:shadow-[inset_0_2px_5px_rgba(0,0,0,0.3)]",
          className
        )}
        ref={ref}
        disabled={disabled}
        {...props}
      >
        <span
          className={cn(
            "pointer-events-none block rounded-full bg-[var(--app-panel)] shadow-[0_3px_9px_rgba(23,41,77,0.16)] ring-0 transition-transform",
            cfg.thumb,
            checked ? cfg.thumbOn : "translate-x-0"
          )}
        />
      </button>
    )
  }
)
Switch.displayName = "Switch"

export { Switch }
