import * as React from "react"
import { cn } from "../Sidebar"

interface SwitchProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, onCheckedChange, disabled, ...props }, ref) => {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onCheckedChange?.(!checked)}
        className={cn(
          "peer inline-flex h-6 w-10 shrink-0 cursor-default items-center rounded-full border transition-all disabled:opacity-50 disabled:cursor-not-allowed",
          checked
            ? "border-[var(--app-accent-border)] bg-[var(--app-accent)]/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
            : "border-[var(--app-stroke)] bg-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]",
          className
        )}
        ref={ref}
        disabled={disabled}
        {...props}
      >
        <span
          className={cn(
            "pointer-events-none block h-[18px] w-[18px] rounded-full ring-0 transition-all",
            checked
              ? "translate-x-[18px] bg-white shadow-[0_4px_10px_rgba(0,0,0,0.18)]"
              : "translate-x-[3px] bg-[rgba(67,76,88,0.82)] shadow-[0_3px_8px_rgba(15,23,42,0.12)]"
          )}
        />
      </button>
    )
  }
)
Switch.displayName = "Switch"
