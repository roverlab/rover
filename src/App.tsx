import React, { useState, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Proxies } from './pages/Proxies';
import { Profiles } from './pages/Profiles';
import { Policies } from './pages/Policies';
import { Logs } from './pages/Logs';
import { Connections } from './pages/Connections';
import { Settings } from './pages/Settings';
import { RuleProviders } from './pages/RuleProviders';
import { Routes } from './pages/Routes';
import { ApiProvider } from './contexts/ApiContext';
import { OverrideRulesProvider } from './contexts/OverrideRulesContext';
import { ProfileProvider } from './contexts/ProfileContext';
import { OverrideRulesGate } from './components/OverrideRulesGate';

export type Page = 'Dashboard' | 'Proxies' | 'Profiles' | 'Policies' | 'RuleProviders' | 'Routes' | 'Logs' | 'Connections' | 'Settings';

function ConfigLoaderOverlay() {
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const handleStart = () => {
      setLoading(true);
      if (timeoutId) clearTimeout(timeoutId);
    };

    const handleEnd = () => {
      // Ensure the animation is visible for at least 1.0s
      timeoutId = setTimeout(() => setLoading(false), 1000);
    };

    // Use IPC event listeners from main process
    const unsubscribeStart = window.ipcRenderer.onConfigGenerateStart(handleStart);
    const unsubscribeEnd = window.ipcRenderer.onConfigGenerateEnd(handleEnd);

    return () => {
      unsubscribeStart();
      unsubscribeEnd();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className={`absolute left-[227px] top-0 bottom-0 w-[3px] z-[999] transition-opacity duration-300 pointer-events-none overflow-hidden ${loading ? "opacity-100" : "opacity-0"}`}>
      <div className="w-full absolute inset-x-0 animate-scan-down h-[50%] bg-[var(--app-accent-strong)] shadow-[0_0_14px_var(--app-accent-strong)]" />
    </div>
  );
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('Dashboard');
  const [settingsInitialTab, setSettingsInitialTab] = useState<'basic' | 'advanced' | null>(null);

  const isPage = (pageName: Page) => currentPage === pageName ? 'flex flex-col flex-1 min-h-0' : 'hidden';

  const goToAdvancedSettings = useCallback(() => {
    setSettingsInitialTab('advanced');
    setCurrentPage('Settings');
  }, []);

  const consumeSettingsTab = useCallback(() => setSettingsInitialTab(null), []);

  return (
    <ApiProvider>
      <ProfileProvider>
        <OverrideRulesProvider>
        <div className="app-shell relative">
        <div className="window-frame text-[var(--app-text)] font-sans relative">
          <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />

          <ConfigLoaderOverlay />

          <main className="app-main">
            <div className="flex-1 relative z-10 overflow-hidden flex flex-col min-h-0">
              <div className={isPage('Dashboard')}><Dashboard isActive={currentPage === 'Dashboard'} /></div>
              <div className={isPage('Proxies')}><Proxies /></div>
              <div className={isPage('Profiles')}><Profiles /></div>
              <div className={isPage('Policies')}>
                <OverrideRulesGate pageName="Policies" onGoToAdvancedSettings={goToAdvancedSettings}>
                  <Policies />
                </OverrideRulesGate>
              </div>
              <div className={isPage('RuleProviders')}>
                <OverrideRulesGate pageName="RuleProviders" onGoToAdvancedSettings={goToAdvancedSettings}>
                  <RuleProviders isActive={currentPage === 'RuleProviders'} />
                </OverrideRulesGate>
              </div>
              <div className={isPage('Routes')}><Routes isActive={currentPage === 'Routes'} /></div>
              <div className={isPage('Logs')}><Logs isActive={currentPage === 'Logs'} /></div>
              <div className={isPage('Connections')}><Connections isActive={currentPage === 'Connections'} /></div>
              <div className={isPage('Settings')}><Settings isActive={currentPage === 'Settings'} initialTab={settingsInitialTab} onTabConsumed={consumeSettingsTab} /></div>
            </div>
          </main>
        </div>
      </div>
        </OverrideRulesProvider>
      </ProfileProvider>
    </ApiProvider>
  );
}
