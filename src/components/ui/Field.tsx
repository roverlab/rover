import * as React from 'react';
import { cn } from '../Sidebar';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return <input ref={ref} className={cn('input-field text-[13px]', className)} {...props} />;
  }
);

Input.displayName = 'Input';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <select ref={ref} className={cn('select-field text-[13px]', className)} {...props}>
        {children}
      </select>
    );
  }
);

Select.displayName = 'Select';
