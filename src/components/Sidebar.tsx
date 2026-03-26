import React from 'react';
import { Activity, Globe, FileText, Settings, List, Zap, GitBranch, Route, ScrollText, Network } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

const NAV_ITEMS: { id: Page; translationKey: string; icon: React.ElementType }[] = [
  { id: 'Dashboard', translationKey: 'navigation.dashboard', icon: Activity },
  { id: 'Proxies', translationKey: 'navigation.proxies', icon: Globe },
  { id: 'Profiles', translationKey: 'navigation.profiles', icon: FileText },
  { id: 'Routes', translationKey: 'navigation.routes', icon: Route },
  { id: 'Logs', translationKey: 'navigation.logs', icon: ScrollText },
  { id: 'Connections', translationKey: 'navigation.connections', icon: Zap },
  { id: 'Policies', translationKey: 'navigation.policies', icon: GitBranch },
  { id: 'DnsPolicies', translationKey: 'navigation.dnsPolicies', icon: Network },
  { id: 'RuleProviders', translationKey: 'navigation.ruleProviders', icon: List },
  { id: 'Settings', translationKey: 'navigation.settings', icon: Settings },
];

export function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  const { t } = useTranslation();
  
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
              <span className="text-[13px] font-medium tracking-tight">{t(item.translationKey)}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
