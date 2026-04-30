import * as React from 'react';
import { cn } from '../../lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'tonal' | 'danger' | 'default' | 'outline' | 'destructive' | 'link';
type ButtonSize = 'sm' | 'md' | 'icon' | 'default' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClassMap: Record<ButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  tonal: 'bg-accent text-accent-foreground border border-border',
  danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  outline: 'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground',
  link: 'text-primary underline-offset-4 hover:underline',
};

const sizeClassMap: Record<ButtonSize, string> = {
  default: 'h-9 px-4 py-2',
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 py-2',
  lg: 'h-10 px-6',
  icon: 'h-9 w-9 p-0',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', type = 'button', ...props }, ref) => {
    const resolvedVariant = variant === 'primary' ? 'default' : variant;
    const resolvedSize = size === 'md' ? 'default' : size;
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          variantClassMap[resolvedVariant],
          sizeClassMap[resolvedSize],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
