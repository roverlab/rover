import React from 'react';
import { Activity, Globe, FileText, Settings, List, Link, GitBranch, ArrowLeftRight, History, Sun, Moon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Page } from '../App';
import { cn } from '../lib/utils';
import { useCoreStatus } from '../contexts/CoreStatusContext';
import { useTheme } from '../contexts/ThemeContext';

interface SidebarProps {
  currentPage: Page;
  onPageChange: (page: Page) => void;
}

const NAV_ITEMS: { id: Page; translationKey: string; icon: React.ElementType }[] = [
  { id: 'Dashboard', translationKey: 'navigation.dashboard', icon: Activity },
  { id: 'Proxies', translationKey: 'navigation.proxies', icon: Globe },
  { id: 'Profiles', translationKey: 'navigation.profiles', icon: FileText },
  { id: 'Logs', translationKey: 'navigation.logs', icon: History },
  { id: 'Connections', translationKey: 'navigation.connections', icon: Link },
  { id: 'Policies', translationKey: 'navigation.policies', icon: GitBranch },
  { id: 'DnsPolicies', translationKey: 'navigation.dnsPolicies', icon: ArrowLeftRight },
  { id: 'RuleProviders', translationKey: 'navigation.ruleProviders', icon: List },
  { id: 'Settings', translationKey: 'navigation.settings', icon: Settings },
];

export function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  const { t } = useTranslation();
  const { isRunning, isLoading } = useCoreStatus();
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className="app-sidebar" style={{ zIndex: 40, WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="app-sidebar-header">
        <div className="app-sidebar-logo">
          <img src="./icon.png" alt="App Logo" className="w-full h-full object-contain" />
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <span className="text-[23px] font-bold leading-none tracking-tight text-[var(--app-text)]">Rover</span>
          {/* Core 状态指示 */}
          <span className={cn(
            "sidebar-core-status",
            isLoading && "status-loading",
            !isLoading && isRunning && "status-running",
            !isLoading && !isRunning && "status-stopped"
          )}>
            <span className="sidebar-core-dot"></span>
            <span className="sidebar-core-text">
              {isLoading
                ? isRunning
                  ? t('dashboard.stopping')
                  : t('dashboard.starting')
                : isRunning
                  ? t('dashboard.coreConnected')
                  : t('dashboard.coreOffline')
              }
            </span>
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1 no-scrollbar" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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

      <div className="sidebar-theme-pill" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <span
          onClick={() => theme !== 'light' && toggleTheme()}
          className={cn(theme === 'light' && 'active-light')}
          title={t('settings.themeLight')}
        >
          <Sun className="w-5 h-5" />
        </span>
        <span
          onClick={() => theme !== 'dark' && toggleTheme()}
          className={cn(theme === 'dark' && 'active-dark')}
          title={t('settings.themeDark')}
        >
          <Moon className="w-5 h-5" />
        </span>
      </div>
    </aside>
  );
}
