import React from 'react';
import { Activity, Globe, FileText, Settings, List, Zap, GitBranch, Route, ScrollText } from 'lucide-react';
import { Page } from '../App';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SidebarProps {
  currentPage: Page;
  onPageChange: (page: Page) => void;
}

const NAV_ITEMS: { id: Page; label: string; icon: React.ElementType }[] = [
  { id: 'Dashboard', label: '仪表盘', icon: Activity },
  { id: 'Proxies', label: '代理', icon: Globe },
  { id: 'Profiles', label: '配置', icon: FileText },
  { id: 'Routes', label: '路由', icon: Route },
  { id: 'Logs', label: '日志', icon: ScrollText },
  { id: 'Connections', label: '连接', icon: Zap },
  { id: 'Policies', label: '策略', icon: GitBranch },
  { id: 'RuleProviders', label: '规则集', icon: List },
  { id: 'Settings', label: '设置', icon: Settings },
];

export function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  return (
    <aside className="app-sidebar" style={{ zIndex: 40, WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="app-sidebar-header">
        <div className="app-sidebar-logo">
          <img src="./icon.png" alt="App Logo" className="w-full h-full object-contain" />
        </div>
      </div>

      <div className="flex-1 px-2 py-2 space-y-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onPageChange(item.id)}
              className={cn(
                "nav-item",
                isActive && "nav-item-active"
              )}
            >
              <span className="nav-item-icon">
                <Icon className="w-[15px] h-[15px]" />
              </span>
              <span className="text-[13px] font-medium tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
