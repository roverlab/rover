import * as React from 'react';
import { cn } from '../Sidebar';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'tonal' | 'danger';
type ButtonSize = 'sm' | 'md' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClassMap: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  tonal: 'btn-tonal',
  danger: 'btn-danger',
};

const sizeClassMap: Record<ButtonSize, string> = {
  sm: 'min-h-8 px-3 text-[12px]',
  md: '',
  icon: 'icon-button',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'secondary', size = 'md', type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          size === 'icon' ? '' : 'btn',
          variantClassMap[variant],
          sizeClassMap[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
