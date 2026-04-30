import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return <input ref={ref} className={cn('input-field text-[13px]', className)} {...props} />;
  }
);

Input.displayName = 'Input';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'w-full transition-all text-left text-[13px] pr-8',
            'rounded-[10px] border border-[var(--app-stroke)] bg-[var(--app-panel)]',
            'text-[var(--app-text)] min-h-[36px] px-3 py-2',
            'appearance-none cursor-pointer',
            'hover:border-[var(--app-stroke-strong)]',
            'focus:border-[var(--app-accent-border)] focus:outline-none focus:ring-0',
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--app-text-quaternary)] pointer-events-none" />
      </div>
    );
  }
);

Select.displayName = 'Select';
