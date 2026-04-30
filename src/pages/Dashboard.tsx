import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useApi } from '../contexts/ApiContext';
import { checkApiAvailable } from '../services/api';
import { Switch } from '../components/ui/Switch';
import { Card } from '../components/ui/Surface';
import { Network, GitBranch, PieChart, Play, Pause, Loader2, Wifi, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import { useNotificationState, NotificationList } from '../components/ui/Notification';
import { getDisplayErrorMessage } from '../shared/error-utils';
import { useCoreStatus } from '../contexts/CoreStatusContext';
import { TrafficCard, formatBytes } from './Dashboard/TrafficCard';
import { NetworkDetectionCard } from './Dashboard/NetworkDetectionCard';
import type { NetworkInfo } from './Dashboard/NetworkDetectionCard';
import { useTrafficData } from './Dashboard/useTrafficData';


interface DashboardProps {
    isActive: boolean;
}

export function Dashboard({ isActive }: DashboardProps) {
    const { t } = useTranslation();
    const { apiUrl, apiSecret, setApiUrl, setApiSecret } = useApi();
    const [isRunning, setIsRunning] = useState(false);
    const [systemProxy, setSystemProxy] = useState(false);
    const [tunMode, setTunMode] = useState(false); // 数据库中的设置
    const [mode, setMode] = useState('rule');
    const [modeChanging, setModeChanging] = useState<string | null>(null); // 正在切换的模式
    const [coreLoading, setCoreLoading] = useState(false); // 内核启动/停止中
    const [coreAction, setCoreAction] = useState<'start' | 'stop' | null>(null); // 当前内核操作类型
    const [tunLoading, setTunLoading] = useState(false); // 虚拟网卡切换中
    const [pausingStatusCheck, setPausingStatusCheck] = useState(false); // 暂停健康检测

    // 使用自定义Hook管理流量数据（切换 TUN/内核操作时暂停，避免重连干扰端口释放）
    // 页面不激活时也暂停，关闭轮询功能
    const pauseTrafficConnections = !isActive || tunLoading || coreLoading;
    const { currentTraffic, totalTraffic, trafficHistory } = useTrafficData(isRunning, apiUrl, apiSecret, pauseTrafficConnections);
    const tunModeDisplayRef = useRef(false); // 操作期间冻结显示，避免 Switch 先改变
    const coreActionLockRef = useRef(false); // 同步锁，防止短时间多次触发
    const { notifications, addNotification, removeNotification } = useNotificationState();
    const { setStatus: setCoreStatus } = useCoreStatus();

    // 同步核心状态到全局 Context（供 Sidebar 等组件读取）
    useEffect(() => {
        setCoreStatus({ isRunning, isLoading: coreLoading });
    }, [isRunning, coreLoading, setCoreStatus]);

    const [startTime, setStartTime] = useState<number | null>(null);
    const startTimeRef = useRef<number | null>(null);
    startTimeRef.current = startTime;
    const [uptime, setUptime] = useState<string>('');
    const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
    const [networkCheckFailed, setNetworkCheckFailed] = useState(false); // 网络检测失败
    const [isLoaded, setIsLoaded] = useState(false);
    const [settingsLoaded, setSettingsLoaded] = useState(false); // 设置是否已从数据库加载
    const [isServiceInstalled, setIsServiceInstalled] = useState(true); // RoverService 服务是否已安装（默认true避免闪烁）
    const [tunModeInitialized, setTunModeInitialized] = useState(false); // tunMode 是否已从数据库加载完成
    const [showNetworkTip, setShowNetworkTip] = useState(false); // 是否显示网络检测提示

    // 防止重复初始化的标记
    const initializedRef = useRef(false);
    const lastNetworkCheckRef = useRef(0);

    useEffect(() => {
        const timer = setTimeout(() => setIsLoaded(true), 150);
        return () => clearTimeout(timer);
    }, []);

    /** 网络检测：内核运行中走代理，未启动走直连 */
    const checkNetwork = useCallback(async () => {
        setNetworkCheckFailed(false);
        try {
            const result = isRunning
                ? await window.ipcRenderer.core.fetchIpThroughProxy()
                : await window.ipcRenderer.core.fetchIpDirect();
            if (result) {
                setNetworkInfo({ ip: result.ip, country: result.country, countryCode: result.countryCode || 'UN' });
            } else {
                setNetworkCheckFailed(true);
            }
        } catch (err) {
            setNetworkCheckFailed(true);
        }
    }, [isRunning]);

    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // 优化版 API 检查：内核启动后立即开始检查，快速轮询直到成功或超时
    // 单次请求 500ms 超时，减少 TUN 模式下的等待感
    const checkApiAfterDelay = async (timeoutMs: number = 5000, pollIntervalMs: number = 150): Promise<boolean> => {
        if (!apiUrl) return false;

        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            const ready = await checkApiAvailable(apiUrl, apiSecret, 500);
            if (ready) return true;
            await wait(pollIntervalMs);
        }

        return false;
    };

    const checkStatus = useCallback(async (skipExternalCheck: boolean = false) => {
        try {
            // 先检测应用内部进程是否运行
            let running = await window.ipcRenderer.core.isRunning();
            // console.log('[状态检测] 内核运行状态:', running, 'apiUrl:', apiUrl);

            // 如果内部进程未运行，且配置了 API URL，则检测是否有外部启动的内核（API 端口可用）
            // skipExternalCheck 用于停止后立即检查，避免不必要的 API 超时等待
            if (!running && apiUrl && !skipExternalCheck) {
                const externalRunning = await checkApiAvailable(apiUrl, apiSecret, 500);
                if (externalRunning) {
                    running = true;
                }
            }

            setIsRunning(running);

            // 系统代理状态以数据库保存的值为准，不再从系统读取
            // 因为用户可能通过其他方式修改了系统代理设置，但我们希望显示应用上次保存的状态

            if (running) {
                // 使用 ref 读取最新值，避免定时器中的 checkStatus 因闭包持有旧的 null 而反复重置 startTime
                if (!startTimeRef.current) {
                    const coreStartTime = await window.ipcRenderer.core.getStartTime();
                    setStartTime(coreStartTime || Date.now());
                }
            } else {
                setStartTime(null);
            }
        } catch (err) {
            console.error('[StatusCheck] Error:', err);
        }
    }, [apiUrl, apiSecret]);

    // 网络检测：应用启动、进入首页、内核状态变化时刷新
    // 使用防抖避免短时间内重复调用（如 React 18 双重挂载）
    useEffect(() => {
        if (!isActive) return;
        
        // 防抖：500ms 内不重复调用
        const now = Date.now();
        if (now - lastNetworkCheckRef.current < 500) return;
        lastNetworkCheckRef.current = now;
        
        checkNetwork();
    }, [isActive, isRunning, checkNetwork]);

    // 从数据库加载 API 设置
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const allSettings = await window.ipcRenderer.db.getAllSettings();
                const urlVal = allSettings['api-url'];
                const secretVal = allSettings['api-secret'];

                // 如果数据库中有设置，则更新到 context
                if (urlVal) {
                    // 确保完整 URL 格式
                    const fullUrl = urlVal.startsWith('http') ? urlVal : `http://${urlVal}`;
                    setApiUrl(fullUrl);
                }
                if (secretVal !== undefined) {
                    setApiSecret(secretVal);
                }
                setSettingsLoaded(true);
            } catch (e) {
                console.error('[Dashboard] Failed to load settings:', e);
                setSettingsLoaded(true); // 即使失败也标记为已加载
            }
        };
        loadSettings();
    }, []);

    // 从数据库加载看板设置（mode、systemProxy）
    // 注意：tunMode 的加载放在单独的 useEffect 中，与权限检查一起处理
    const loadDashboardSettings = useCallback(async () => {
        try {
            const allSettings = await window.ipcRenderer.db.getAllSettings();

            // 读取 mode（出站模式）
            const savedMode = allSettings['dashboard-mode'];
            if (savedMode) {
                setMode(savedMode);
            }

            // 读取 systemProxy（系统代理）- 以数据库为准
            const savedSystemProxy = allSettings['dashboard-system-proxy'];
            if (savedSystemProxy !== undefined) {
                const enabled = savedSystemProxy === 'true';
                setSystemProxy(enabled);
                // 同步系统代理状态到数据库中保存的值
                window.ipcRenderer.core.setSystemProxy(enabled);
            }
        } catch (e) {
            console.error('[Dashboard] Failed to load dashboard settings:', e);
        }
    }, []);

    // 加载 tunMode（只读取数据库值，与服务安装状态无关）
    const loadTunMode = useCallback(async (force: boolean = false) => {
        try {
            // 并行获取数据库值和服务安装状态
            const [allSettings, installed] = await Promise.all([
                window.ipcRenderer.db.getAllSettings(),
                window.ipcRenderer.core.isServiceInstalled()
            ]);

            // 更新服务安装状态
            setIsServiceInstalled(installed);

            // 读取 tunMode（虚拟网卡）
            const savedTunMode = allSettings['dashboard-tun-mode'];
            const dbTunMode = savedTunMode === 'true';
            
            // 显示值只和数据库有关
            setTunMode(dbTunMode);
            tunModeDisplayRef.current = dbTunMode;
            console.log('[Dashboard] tunMode loaded - db value:', dbTunMode, 'service installed:', installed);

        } catch (e) {
            console.error('[Dashboard] Failed to load tunMode:', e);
            setTunMode(false);
            tunModeDisplayRef.current = false;
        } finally {
            setTunModeInitialized(true);
        }
    }, []);

    // 页面激活时加载/刷新设置（合并初始化和激活刷新逻辑）
    useEffect(() => {
        if (!isActive) return;

        // 初始化时只加载一次
        if (!initializedRef.current) {
            initializedRef.current = true;
            loadTunMode();
            loadDashboardSettings();
        } else {
            // 非首次激活时刷新数据（从其他页面返回）
            loadTunMode();
            loadDashboardSettings();
        }
    }, [isActive, loadTunMode, loadDashboardSettings]);

    // 定时检测运行状态（不再刷新 configs）
    useEffect(() => {
        // 等待设置加载完成后再开始检测
        if (!settingsLoaded) return;

        // 如果正在暂停状态检测，则不运行
        if (pausingStatusCheck) return;

        // 页面不激活时不运行轮询
        if (!isActive) return;

        checkStatus();
        const timer = setInterval(() => checkStatus(), 5000); // 从3秒改为5秒，减少性能开销
        return () => clearInterval(timer);
    }, [settingsLoaded, apiUrl, apiSecret, pausingStatusCheck, isActive]); // 注意：不要加入 startTime，否则会循环触发

    // 运行时间计时器
    useEffect(() => {
        // 页面不激活时不运行
        if (!isActive) return;

        let interval: NodeJS.Timeout;
        if (isRunning) {
            interval = setInterval(() => {
                const start = startTime || Date.now();
                const diff = Math.floor((Date.now() - start) / 1000);
                const h = Math.floor(diff / 3600).toString().padStart(2, '0');
                const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
                const s = (diff % 60).toString().padStart(2, '0');
                setUptime(`${h}:${m}:${s}`);
            }, 2000); // 从1秒改为2秒刷新，减少更新频率
        } else {
            setUptime('');
        }
        return () => clearInterval(interval);
    }, [isRunning, startTime, isActive]);


    const runStopService = async () => {
        if (coreActionLockRef.current) return;
        coreActionLockRef.current = true;
        setCoreAction('stop');
        setCoreLoading(true);
        try {
            await window.ipcRenderer.core.stop();
            // 乐观更新：后台已停止，立即更新 UI，不再等待 checkStatus
            setIsRunning(false);
            setStartTime(null);
            checkStatus(true).catch(() => {}); // 后台同步，不阻塞
        } catch (err: any) {
            console.error('Failed to stop core', err);
            addNotification(`${t('dashboard.stopCoreFailed')}: ${getDisplayErrorMessage(err)}`, 'error');
        } finally {
            setCoreLoading(false);
            setCoreAction(null);
            coreActionLockRef.current = false;
        }
    };

    const runStartService = async () => {
        if (coreActionLockRef.current) return;
        coreActionLockRef.current = true;
        setCoreAction('start');
        setCoreLoading(true);
        try {
            const config = await window.ipcRenderer.core.getActiveConfig();
            if (config) {
                await window.ipcRenderer.core.start();
                // 乐观更新：后台已启动，立即更新 UI，不阻塞在 API 轮询
                const coreStartTime = await window.ipcRenderer.core.getStartTime();
                setIsRunning(true);
                setStartTime(coreStartTime || Date.now());
                // 后台验证 API 就绪（快速轮询 150ms，超时 5s），失败则提示
                checkApiAfterDelay(5000, 150).then((ready) => {
                    if (!ready) {
                        addNotification(t('dashboard.apiNotReady'), 'warning');
                    }
                    checkStatus().catch(() => {});
                }).catch(() => {});
            } else {
                throw new Error(t('dashboard.pleaseAddSubscription'));
            }
        } catch (err: any) {
            console.error('Failed to start core', err);
            addNotification(`${t('dashboard.startCoreFailed')}: ${getDisplayErrorMessage(err)}`, 'error');
        } finally {
            setCoreLoading(false);
            setCoreAction(null);
            coreActionLockRef.current = false;
        }
    };

    const handleStopService = async () => {
        if (coreLoading) return;
        runStopService();
    };

    const handleStartService = async () => {
        if (coreLoading) return;
        runStartService();
    };

    const handleToggleSystemProxy = async (enable: boolean) => {
        try {
            // 1. 先保存到本地数据库
            await window.ipcRenderer.db.setSetting('dashboard-system-proxy', enable ? 'true' : 'false');
            console.log('[Dashboard] System proxy status saved to database:', enable);

            // 2. 更新本地状态
            setSystemProxy(enable);

            // 3. 系统代理是操作系统级别的设置，直接调用即可（不需要判断内核是否运行）
            await window.ipcRenderer.core.setSystemProxy(enable);
            console.log('[Dashboard] System proxy', enable ? 'enabled' : 'disabled');
        } catch (err) {
            console.error('Failed to toggle system proxy', err);
        }
    };

    const handleToggleTunMode = async (enable: boolean) => {
        // 双重检查：tunLoading 状态 + 同步锁，防止重复触发
        if (tunLoading || coreActionLockRef.current) return;

        // 1. 先冻结 Switch 显示（保持原状态），再显示 loading
        tunModeDisplayRef.current = tunMode;
        setTunLoading(true);
        coreActionLockRef.current = true;

        // 等待 React 完成重渲染并关闭 Traffic WebSocket，避免重连干扰端口释放
        await new Promise<void>((r) => {
            requestAnimationFrame(() => requestAnimationFrame(() => r()));
        });

        try {
            // 开启 TUN 模式时需要检查 RoverService 服务是否已安装
            if (enable && !isServiceInstalled) {
                console.log('[Dashboard] RoverService not installed, starting auto install...');
                addNotification(t('dashboard.installingService'), 'info');

                // 自动安装服务
                const installResult = await window.ipcRenderer.roverservice.install();
                if (!installResult.success) {
                    // 用户拒绝安装服务（取消 UAC 提示），不显示错误提示
                    if (!installResult.isUserCanceled) {
                        console.error('[Dashboard] RoverService installation failed:', installResult.error);
                        addNotification(t('dashboard.serviceInstallFailed', { error: installResult.error || 'Unknown' }), 'error');
                    }
                    setTunLoading(false);
                    return;
                }

                console.log('[Dashboard] RoverService installed successfully');
                addNotification(t('dashboard.serviceInstalled'), 'success');

                // 更新服务安装状态
                setIsServiceInstalled(true);

                // 等待服务完全就绪（短暂延迟确保服务启动完成）
                await wait(1000);
            }

            // 2. 保存到本地数据库并重新生成配置（TUN 配置在 mergeSettingsIntoConfig 中生效）
            await window.ipcRenderer.db.setTunModeWithConfigGeneration('dashboard-tun-mode', enable ? 'true' : 'false');
            console.log('[Dashboard] TUN mode saved to database and config regenerated:', enable);

            // 4. 如果内核正在运行，需要重新启动以应用新的 TUN 配置
            // 使用 restart 而非 start：restart 会先 stop（清理可能残留的 sing-box 进程）、等待端口释放后再 start，
            // 避免 9090 端口被旧进程占用导致 "address already in use" 错误
            if (isRunning) {
                console.log('[Dashboard] Restarting to apply TUN config change, pausing health check');
                setPausingStatusCheck(true); // 暂停健康检测
                
                try {
                    await window.ipcRenderer.core.start();
                    // 更新启动时间
                    const newStartTime = await window.ipcRenderer.core.getStartTime();
                    setStartTime(newStartTime || Date.now());
                    
                    console.log('[Dashboard] TUN config restart complete, resuming health check');
                } finally {
                    setPausingStatusCheck(false); // 恢复健康检测
                }
            }

            // 5. 操作完成后才更新 Switch 显示状态
            setTunMode(enable);
            tunModeDisplayRef.current = enable;

            // 6. 提供操作结果反馈
            if (enable) {
                addNotification(t('dashboard.tunModeEnabled'), 'success');
            } else {
                addNotification(t('dashboard.tunModeDisabled'), 'success');
            }
        } catch (err: any) {
            console.error('Failed to toggle tun mode', err);
            addNotification(`${t('dashboard.tunModeSwitchFailed')}: ${getDisplayErrorMessage(err)}`, 'error');
        } finally {
            setTunLoading(false);
            coreActionLockRef.current = false;
        }
    };

    // 显示 Toast 提示
    const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
        addNotification(message, type);
    };

    const handleModeChange = async (newMode: string) => {
        if (modeChanging) return; // 防止重复点击
        if (mode === newMode) return; // 模式相同不处理

        setModeChanging(newMode);

        try {
            // 1. 保存到本地数据库
            await window.ipcRenderer.db.setSetting('dashboard-mode', newMode);
            console.log('[Dashboard] Outbound mode saved to database:', newMode);

            // 2. 触发重新生成配置文件（配置生成时会读取 dashboard-mode，写入时若内核运行中会自动重启）
            window.ipcRenderer.core.generateConfig();
            console.log('[Dashboard] Config file regenerated');

            // 更新本地状态
            setMode(newMode);
            showToast(newMode === 'rule' ? t('dashboard.switchedToRuleMode') : newMode === 'global' ? t('dashboard.switchedToGlobalMode') : t('dashboard.switchedToDirectMode'), 'success');

            // 3. 通知托盘菜单更新
            console.log('[Dashboard] Notifying tray to update menu');
            await window.ipcRenderer.core.updateTrayMenu();
            console.log('[Dashboard] Tray menu update complete');
        } catch (err: any) {
            console.error('[Mode Change] Failed:', err.message);
            showToast(`${t('dashboard.modeSwitchFailed')}: ${getDisplayErrorMessage(err)}`, 'error');
        } finally {
            setModeChanging(null);
        }
    };

    // 使用 ref 保存最新的处理函数，确保托盘事件能调用到最新的函数
    const handleStartServiceRef = useRef(handleStartService);
    const handleStopServiceRef = useRef(handleStopService);
    const handleModeChangeRef = useRef(handleModeChange);

    useEffect(() => {
        handleStartServiceRef.current = handleStartService;
        handleStopServiceRef.current = handleStopService;
        handleModeChangeRef.current = handleModeChange;
    });

    // 监听托盘菜单事件（使用 ref 确保只注册一次）
    const trayListenersRef = useRef<{
        onStart: () => void;
        onStop: () => void;
        onModeChanged: (_event: any, mode: string) => void;
    } | null>(null);

    useEffect(() => {
        // 如果已经注册过，不再重复注册
        if (trayListenersRef.current) return;

        const onStart = () => handleStartServiceRef.current();
        const onStop = () => handleStopServiceRef.current();
        const onModeChanged = (_event: any, mode: string) => handleModeChangeRef.current(mode);

        trayListenersRef.current = { onStart, onStop, onModeChanged };

        window.ipcRenderer.on('tray-start-service', onStart);
        window.ipcRenderer.on('tray-stop-service', onStop);
        window.ipcRenderer.on('tray-mode-changed', onModeChanged);

        // 注意：不在这里移除监听器，因为严格模式会重新挂载
    }, []);

    // 截图风格：靛蓝紫 + 翠绿配色
    const chartDownStroke = '#22c55e';
    const chartUpStroke = '#4F6BF6';

    return (
        <div className="page-shell text-[var(--app-text-secondary)]">

            <div className="page-header" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
                <div>
                    <h1 className="page-title">{t('dashboard.title')}</h1>
                </div>
                <div className="toolbar" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    <div className="flex items-center gap-2.5">
                        {/* 启动/关闭内核按钮 */}
                        {isRunning ? (
                            <button
                                onClick={handleStopService}
                                disabled={coreLoading}
                                className={cn(
                                    "btn-core-control btn-core-stop",
                                    coreLoading && "opacity-50 cursor-not-allowed"
                                )}
                                title={t('dashboard.stopCore')}
                            >
                                <Pause className="w-3.5 h-3.5" />
                                <span>{t('dashboard.stopCore')}</span>
                            </button>
                        ) : (
                            <button
                                onClick={handleStartService}
                                disabled={coreLoading}
                                className={cn(
                                    "btn-core-control btn-core-start",
                                    coreLoading && "opacity-50 cursor-not-allowed"
                                )}
                                title={t('dashboard.startCore')}
                            >
                                <Play className="w-3.5 h-3.5" />
                                <span>{t('dashboard.startCore')}</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="page-content">
                <div className="grid grid-cols-3 gap-4">
                    <TrafficCard
                        currentTraffic={currentTraffic}
                        trafficHistory={trafficHistory}
                    />

                    <div className="flex flex-col gap-4">
                        <Card className="p-4 card-decorative">
                            <div className="relative z-10 flex items-center justify-between gap-3">
                                <div>
                            <div className="panel-title">
                                <span className="panel-title-icon">
                                    <Wifi className="w-3.5 h-3.5" />
                                </span>
                                <span>{t('dashboard.systemProxy')}</span>
                            </div>
                            <p className="text-[12px] text-[var(--app-text-quaternary)] mt-2 leading-relaxed">{t('dashboard.systemProxyDesc')}</p>
                                </div>
                                <Switch checked={systemProxy} onCheckedChange={handleToggleSystemProxy} />
                            </div>
                        </Card>

                        <Card className="p-4 card-decorative">
                            <div className="relative z-10 flex items-center justify-between gap-3">
                                <div>
                            <div className="panel-title">
                                <span className="panel-title-icon">
                                    <Network className="w-3.5 h-3.5" />
                                </span>
                                <span>{t('dashboard.tunMode')}</span>
                                        {tunMode && !isServiceInstalled && (
                                            <span className="ml-2 text-[var(--app-text-warning)]" title={t('tooltips.serviceNotInstalled')}>
                                                <AlertTriangle className="w-3.5 h-3.5" />
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[12px] text-[var(--app-text-quaternary)] mt-2 leading-relaxed">
                                        {tunMode && !isServiceInstalled 
                                            ? t('dashboard.tunModeNotInstalled')
                                            : t('dashboard.tunModeDesc')
                                        }
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {(!tunModeInitialized || tunLoading) && <Loader2 className="w-4 h-4 animate-spin text-[var(--app-text-quaternary)]" />}
                                    {tunModeInitialized && (
                                        <Switch
                                            checked={tunLoading ? tunModeDisplayRef.current : tunMode}
                                            onCheckedChange={handleToggleTunMode}
                                            disabled={tunLoading}
                                        />
                                    )}
                                </div>
                            </div>
                        </Card>


                    </div>

                    <Card className="p-4">
                        <div className="panel-title mb-3">
                            <span className="panel-title-icon">
                                <GitBranch className="w-3.5 h-3.5" />
                            </span>
                            <span>{t('dashboard.outboundMode')}</span>
                        </div>
                        <div className="space-y-2">
                            {[
                                { id: 'rule', label: t('dashboard.ruleMode'), desc: t('dashboard.ruleModeDesc') },
                                { id: 'global', label: t('dashboard.globalMode'), desc: t('dashboard.globalModeDesc') },
                                { id: 'direct', label: t('dashboard.directMode'), desc: t('dashboard.directModeDesc') }
                            ].map(m => (
                                <button
                                    key={m.id}
                                    disabled={modeChanging !== null}
                                    className={cn(
                                        "w-full flex items-center gap-2 rounded-[14px] px-3 py-2 text-left transition-all border",
                                        mode === m.id
                                            ? "border-[var(--app-accent-border)] bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)]"
                                            : "border-[var(--app-stroke)] bg-[var(--app-panel)]/40 text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)]",
                                        modeChanging !== null && modeChanging !== m.id && "opacity-50 cursor-not-allowed"
                                    )}
                                    onClick={() => handleModeChange(m.id)}
                                >
                                    <span className={cn(
                                        "flex h-4 w-4 items-center justify-center rounded-full border transition-colors shrink-0",
                                        mode === m.id
                                            ? "border-[var(--app-accent)] bg-[var(--app-accent)] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.9)]"
                                            : "border-[var(--app-stroke-strong)] bg-[var(--app-panel)]/50"
                                    )}>
                                        {modeChanging === m.id && (
                                            <Loader2 className="w-2.5 h-2.5 animate-spin text-white" />
                                        )}
                                    </span>
                                    <div className="flex flex-col">
                                        <span className="text-[13px] font-medium">{m.label}</span>
                                        <span className="text-[11px] text-[var(--app-text-quaternary)]">{m.desc}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </Card>

                    <NetworkDetectionCard
                        networkInfo={networkInfo}
                        showNetworkTip={showNetworkTip}
                        onShowNetworkTip={setShowNetworkTip}
                    />

                    <Card className="p-4">
                        <div className="panel-title mb-3">
                            <span className="panel-title-icon">
                                <PieChart className="w-3.5 h-3.5" />
                            </span>
                            <span>{t('dashboard.trafficStats')}</span>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <div className="relative w-16 h-16 ml-1">
                                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                    <path
                                        strokeWidth="5"
                                        stroke="currentColor" className="text-[rgba(23,26,33,0.08)] dark:text-[rgba(148,163,184,0.12)]"
                                        fill="none"
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    />
                                    {/* 上传流量环 - 蓝色，外层 */}
                                    <path
                                        strokeDasharray={`${Math.min((totalTraffic.up / Math.max(totalTraffic.up + totalTraffic.down, 1)) * 100, 100)}, 100`}
                                        strokeWidth="5"
                                        strokeLinecap="round"
                                        stroke={chartUpStroke}
                                        fill="none"
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    />
                                    {/* 下载流量环 - 绿色，内层 */}
                                    <path
                                        strokeDasharray={`${Math.min((totalTraffic.down / Math.max(totalTraffic.up + totalTraffic.down, 1)) * 100, 100)}, 100`}
                                        strokeWidth="5"
                                        strokeLinecap="round"
                                        stroke={chartDownStroke}
                                        fill="none"
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    />
                                </svg>
                            </div>

                            <div className="flex flex-col gap-3 text-[11px] font-mono">
                                <div className="flex items-center gap-2 whitespace-nowrap text-[var(--app-text-secondary)]">
                                    <span className="w-3 h-[3px] flex-shrink-0 rounded-full bg-[var(--app-accent)]" />
                                    <span>{t('dashboard.upload')}</span>
                                </div>
                                <div className="flex items-center gap-2 whitespace-nowrap text-[var(--app-text-secondary)]">
                                    <span className="w-3 h-[3px] flex-shrink-0 rounded-full bg-[var(--app-success)]" />
                                    <span>{t('dashboard.download')}</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-5 grid grid-cols-2 gap-2.5 text-[11px] font-mono">
                            <div className="flex flex-col items-start rounded-xl border border-[var(--app-divider)] bg-gradient-to-br from-[var(--app-panel)]/60 to-[var(--app-panel)]/30 px-3 py-2.5">
                                <span className="text-[10px] font-medium text-[var(--app-text-tertiary)] mb-0.5">{t('dashboard.totalUpload')}</span>
                                <div className="flex items-center gap-1">
                                    <svg className="w-3 h-3 text-[var(--app-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                                    <span className="text-[13px] font-semibold text-[var(--app-text)]">{formatBytes(totalTraffic.up)}</span>
                                </div>
                            </div>
                            <div className="flex flex-col items-start rounded-xl border border-[var(--app-divider)] bg-gradient-to-br from-[var(--app-panel)]/60 to-[var(--app-panel)]/30 px-3 py-2.5">
                                <span className="text-[10px] font-medium text-[var(--app-text-tertiary)] mb-0.5">{t('dashboard.totalDownload')}</span>
                                <div className="flex items-center gap-1">
                                    <svg className="w-3 h-3 text-[var(--app-success)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
                                    <span className="text-[13px] font-semibold text-[var(--app-text)]">{formatBytes(totalTraffic.down)}</span>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Notification */}
            <NotificationList notifications={notifications} onRemove={removeNotification} />

            {/* 网络检测说明弹窗 */}
            {createPortal(
                <AnimatePresence>
                    {showNetworkTip && (
                        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 z-0 bg-black/40 backdrop-blur-sm"
                                onClick={() => setShowNetworkTip(false)}
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                className="relative z-10 w-full max-w-sm flex flex-col bg-[var(--app-panel)] border border-[var(--app-stroke)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
                                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties }
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[var(--app-divider)] bg-[var(--app-panel)]/50">
                                    <h2 className="text-[15px] font-semibold text-[var(--app-text)]">{t('dashboard.networkTipTitle')}</h2>
                                    <button
                                        type="button"
                                        onClick={() => setShowNetworkTip(false)}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                                        aria-label={t('common.close')}
                                    >
                                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M18 6L6 18" />
                                            <path d="M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6">
                                    <p className="text-[14px] text-[var(--app-text-secondary)] leading-relaxed">
                                        {t('dashboard.networkTipDesc')}
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center justify-end gap-2 px-6 py-4 border-t border-[var(--app-divider)] bg-[var(--app-panel)]/30">
                                    <button
                                        onClick={() => setShowNetworkTip(false)}
                                        className="px-4 py-2 text-[13px] font-medium text-white bg-[var(--app-accent)] hover:opacity-90 rounded-[10px] transition-colors"
                                    >
                                        {t('tooltips.confirm')}
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}

        </div>
    );
}
