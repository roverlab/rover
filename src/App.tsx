import React, { useState, useCallback, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Proxies } from './pages/Proxies';
import { Profiles } from './pages/Profiles';
import { Policies } from './pages/Policies';
import { DnsPolicies } from './pages/DnsPolicies';
import { Logs } from './pages/Logs';
import { Connections } from './pages/Connections';
import { Settings } from './pages/Settings';
import { RuleProviders } from './pages/RuleProviders';
import { Routes } from './pages/Routes';
import { ApiProvider } from './contexts/ApiContext';
import { OverrideRulesProvider } from './contexts/OverrideRulesContext';
import { OverrideRulesGate } from './components/OverrideRulesGate';
import { LanguageSelectModal } from './components/LanguageSelectModal';
import { hasLanguageSelected } from './i18n';

export type Page = 'Dashboard' | 'Proxies' | 'Profiles' | 'Policies' | 'DnsPolicies' | 'RuleProviders' | 'Routes' | 'Logs' | 'Connections' | 'Settings';

function LanguageSelectWrapper({ children, onLanguageSelected }: { children: React.ReactNode; onLanguageSelected: () => void }) {
  const [showModal, setShowModal] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // 检查数据库中是否有语言设置
    const checkLanguage = async () => {
      try {
        const hasSelected = await hasLanguageSelected();
        console.log('[App] hasLanguageSelected result:', hasSelected);
        if (!hasSelected) {
          console.log('[App] No language setting found, showing modal');
          setShowModal(true);
        } else {
          console.log('[App] Language setting found, skipping modal');
        }
      } catch (e) {
        // 出错时不显示弹窗，使用默认语言
        console.warn('[App] Failed to check language setting:', e);
      } finally {
        setChecking(false);
      }
    };
    checkLanguage();
  }, []);

  const handleClose = () => {
    setShowModal(false);
    onLanguageSelected();
  };

  // 检查中或显示弹窗时，不显示主页面
  if (checking || showModal) {
    return (
      <LanguageSelectModal open={showModal} onClose={handleClose} />
    );
  }

  return <>{children}</>;
}

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
    <div className={`absolute left-[227px] top-0 bottom-0 w-[3px] z-[1] transition-opacity duration-300 pointer-events-none overflow-hidden ${loading ? "opacity-100" : "opacity-0"}`}>
      <div className="w-full absolute inset-x-0 animate-scan-down h-[50%] bg-[var(--app-accent-strong)] shadow-[0_0_14px_var(--app-accent-strong)]" />
    </div>
  );
}

// 使用 React.memo 缓存页面组件，避免不必要的重渲染
const MemoizedDashboard = React.memo(Dashboard);
const MemoizedProxies = React.memo(Proxies);
const MemoizedProfiles = React.memo(Profiles);
const MemoizedPolicies = React.memo(Policies);
const MemoizedDnsPolicies = React.memo(DnsPolicies);
const MemoizedRuleProviders = React.memo(RuleProviders);
const MemoizedRoutes = React.memo(Routes);
const MemoizedLogs = React.memo(Logs);
const MemoizedConnections = React.memo(Connections);
const MemoizedSettings = React.memo(Settings);

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('Dashboard');
  const [settingsInitialTab, setSettingsInitialTab] = useState<'basic' | 'advanced' | 'dns' | 'about' | null>(null);

  const goToAdvancedSettings = useCallback(() => {
    setSettingsInitialTab('advanced');
    setCurrentPage('Settings');
  }, []);

  const consumeSettingsTab = useCallback(() => setSettingsInitialTab(null), []);

  // 判断页面是否活跃
  const isPageActive = (pageName: Page) => currentPage === pageName;

  // 主应用内容
  const appContent = (
    <div className="app-shell relative">
      <div className="window-frame text-[var(--app-text)] font-sans relative">
        <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />

        <ConfigLoaderOverlay />

        <main className="app-main">
          <div className="flex-1 relative z-10 overflow-hidden flex flex-col min-h-0">
            {/* 仪表盘页面：使用 hidden 保留状态，离开后不用销毁 */}
            <div className={isPageActive('Dashboard') ? 'contents' : 'hidden'}>
              <MemoizedDashboard isActive={isPageActive('Dashboard')} />
            </div>
            {/* 代理页面：使用 hidden 保留状态，离开后不用销毁 */}
            <div className={isPageActive('Proxies') ? 'contents' : 'hidden'}>
              <MemoizedProxies isActive={isPageActive('Proxies')} />
            </div>
            {/* 其他页面条件渲染，切换时卸载以节省内存 */}
            {isPageActive('Profiles') && <MemoizedProfiles isActive={true} />}
            {isPageActive('Policies') && (
              <OverrideRulesGate pageName="Policies" onGoToAdvancedSettings={goToAdvancedSettings}>
                <MemoizedPolicies isActive={true} />
              </OverrideRulesGate>
            )}
            {isPageActive('DnsPolicies') && (
              <OverrideRulesGate pageName="DnsPolicies" onGoToAdvancedSettings={goToAdvancedSettings}>
                <MemoizedDnsPolicies isActive={true} />
              </OverrideRulesGate>
            )}
            {isPageActive('RuleProviders') && (
              <OverrideRulesGate pageName="RuleProviders" onGoToAdvancedSettings={goToAdvancedSettings}>
                <MemoizedRuleProviders isActive={true} />
              </OverrideRulesGate>
            )}
            {isPageActive('Routes') && <MemoizedRoutes isActive={true} />}
            {isPageActive('Logs') && <MemoizedLogs isActive={true} />}
            {isPageActive('Connections') && <MemoizedConnections isActive={true} />}
            {isPageActive('Settings') && (
              <MemoizedSettings isActive={true} initialTab={settingsInitialTab} onTabConsumed={consumeSettingsTab} />
            )}
          </div>
        </main>
      </div>
    </div>
  );

  return (
    <ApiProvider>
      <OverrideRulesProvider>
        <LanguageSelectWrapper onLanguageSelected={() => {}}>
          {appContent}
        </LanguageSelectWrapper>
      </OverrideRulesProvider>
    </ApiProvider>
  );
}
