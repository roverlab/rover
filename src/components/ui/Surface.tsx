import * as React from 'react';
import { cn } from '../../lib/utils';

type SurfaceProps = React.HTMLAttributes<HTMLDivElement> & {
  children?: React.ReactNode;
  soft?: boolean;
};

export function Card({ className, soft = false, ...props }: SurfaceProps) {
  return <div className={cn(soft ? 'panel-soft' : 'panel', className)} {...props} />;
}

export function SectionHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('panel-header', className)} {...props} />;
}

export function ListRow({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('list-row', className)} {...props} />;
}

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  children?: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
};

const badgeToneClassMap: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral: 'badge-neutral',
  accent: 'badge-accent',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
};

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return <span className={cn('badge', badgeToneClassMap[tone], className)} {...props} />;
}
