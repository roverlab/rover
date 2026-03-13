import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApi } from '../contexts/ApiContext';
import { fetchConfigs, getWsUrl, checkApiAvailable } from '../services/api';
import { Switch } from '../components/ui/Switch';
import { Button } from '../components/ui/Button';
import { Badge, Card } from '../components/ui/Surface';
import { Activity, Shuffle, Network, GitBranch, Globe, Monitor, PieChart, Play, Pause, RefreshCw, Loader2, Wifi } from 'lucide-react';
import { cn } from '../components/Sidebar';
import * as FlagIcons from 'country-flag-icons/react/3x2';
import { useNotificationState, NotificationList } from '../components/ui/Notification';

interface TrafficData {
    up: number;
    down: number;
    time: number;
}

function formatBytes(bytes: number) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

interface DashboardProps {
    isActive: boolean;
}

export function Dashboard({ isActive }: DashboardProps) {
    const { apiUrl, apiSecret, setApiUrl, setApiSecret } = useApi();
    const [isRunning, setIsRunning] = useState(false);
    const [systemProxy, setSystemProxy] = useState(false);
    const [tunMode, setTunMode] = useState(false); // 数据库中的设置
    const [trafficHistory, setTrafficHistory] = useState<TrafficData[]>([]);
    const [currentTraffic, setCurrentTraffic] = useState({ up: 0, down: 0 });
    const [totalTraffic, setTotalTraffic] = useState({ up: 0, down: 0 });
    const [mode, setMode] = useState('rule');
    const [modeChanging, setModeChanging] = useState<string | null>(null); // 正在切换的模式
    const [coreLoading, setCoreLoading] = useState(false); // 内核启动/停止中
    const [coreAction, setCoreAction] = useState<'start' | 'stop' | 'restart' | null>(null); // 当前内核操作类型
    const [tunLoading, setTunLoading] = useState(false); // 虚拟网卡切换中
    const tunModeDisplayRef = useRef(false); // 操作期间冻结显示，避免 Switch 先改变
    const coreActionLockRef = useRef(false); // 同步锁，防止短时间多次触发
    const { notifications, addNotification, removeNotification } = useNotificationState();

    const [startTime, setStartTime] = useState<number | null>(null);
    const startTimeRef = useRef<number | null>(null);
    startTimeRef.current = startTime;
    const [uptime, setUptime] = useState<string>('');
    const [networkInfo, setNetworkInfo] = useState<{ ip: string; country: string; countryCode: string } | null>(null);
    const [localIp, setLocalIp] = useState("127.0.0.1");
    const [isLoaded, setIsLoaded] = useState(false);
    const [settingsLoaded, setSettingsLoaded] = useState(false); // 设置是否已从数据库加载
    const [showNetworkTip, setShowNetworkTip] = useState(false); // 是否显示网络检测提示
    const [dashboardSettingsLoaded, setDashboardSettingsLoaded] = useState(false); // 看板设置是否已从数据库加载
    const [isAdmin, setIsAdmin] = useState(false); // 是否有管理员权限

    useEffect(() => {
        const timer = setTimeout(() => setIsLoaded(true), 150);
        return () => clearTimeout(timer);
    }, []);

    const checkNetwork = async () => {
        // 备选 API 列表
        const apis = [
            { url: 'https://ipapi.co/json/', parse: (data: any) => ({ ip: data.ip, country: data.country_name, code: data.country_code }) },
            { url: 'https://ipwho.is/', parse: (data: any) => ({ ip: data.ip, country: data.country, code: data.country_code }) },
            { url: 'http://ip-api.com/json/?lang=zh-CN', parse: (data: any) => ({ ip: data.query, country: data.country, code: data.countryCode }) },
        ];

        for (const api of apis) {
            try {
                const res = await fetch(api.url, {
                    signal: AbortSignal.timeout(5000)  // 5秒超时
                });
                if (!res.ok) continue;
                const data = await res.json();
                const { ip, country, code } = api.parse(data);
                if (ip) {
                    const upperCode = code ? code.toUpperCase() : '';
                    setNetworkInfo({ ip, country: country || '未知', countryCode: upperCode || 'UN' });
                    return;  // 成功后退出
                }
            } catch (err) {
                // 继续尝试下一个 API
            }
        }
    };

    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // 优化版 API 检查：内核启动后立即开始检查，快速轮询直到成功或超时
    const checkApiAfterDelay = async (timeoutMs: number = 5000, pollIntervalMs: number = 200): Promise<boolean> => {
        if (!apiUrl) return false;

        const startTime = Date.now();

        // 立即开始检查，无需等待
        // 使用短超时（500ms）快速检查，避免长时间等待
        while (Date.now() - startTime < timeoutMs) {
            const ready = await checkApiAvailable(apiUrl, apiSecret, 500);
            if (ready) return true;
            // 等待一小段时间后重试
            await wait(pollIntervalMs);
        }

        return false;
    };

    // 获取 configs（只在初始化时调用一次）
    const fetchConfigsOnce = async () => {
        if (!apiUrl) return;
        try {
            const ready = await checkApiAvailable(apiUrl, apiSecret, 1000);
            if (!ready) {
                console.warn('[Dashboard] API 尚未就绪，跳过本次 configs 拉取');
                return;
            }
            const data = await fetchConfigs(apiUrl, apiSecret);
            setMode(normalizeMode(data.mode || 'rule'));
        } catch (e) {
            console.error('Failed to fetch configs', e);
        }
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
            console.error('[状态检测] 错误:', err);
        }
    }, [apiUrl, apiSecret]);

    // 初始化时获取一次 configs
    useEffect(() => {
        if (isRunning) {
            fetchConfigsOnce();
        }
    }, [isRunning]);

    // 组件加载时检测网络信息（不依赖内核状态）
    useEffect(() => {
        checkNetwork();
    }, []);

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
                console.log('[Dashboard] 已从数据库加载 API 设置:', urlVal);
            } catch (e) {
                console.error('[Dashboard] 加载设置失败:', e);
                setSettingsLoaded(true); // 即使失败也标记为已加载
            }
        };
        loadSettings();
    }, []);

    // 从数据库加载看板设置（mode、systemProxy、tunMode）
    const loadDashboardSettings = useCallback(async () => {
        try {
            const allSettings = await window.ipcRenderer.db.getAllSettings();

            // 读取 mode（出站模式）
            const savedMode = allSettings['dashboard-mode'];
            if (savedMode) {
                setMode(savedMode);
                console.log('[Dashboard] 已从数据库加载 mode:', savedMode);
            }

            // 读取 systemProxy（系统代理）- 以数据库为准
            const savedSystemProxy = allSettings['dashboard-system-proxy'];
            if (savedSystemProxy !== undefined) {
                const enabled = savedSystemProxy === 'true';
                setSystemProxy(enabled);
                console.log('[Dashboard] 已从数据库加载 systemProxy:', enabled);
                // 同步系统代理状态到数据库中保存的值
                window.ipcRenderer.core.setSystemProxy(enabled);
            }

            // 读取 tunMode（虚拟网卡）
            const savedTunMode = allSettings['dashboard-tun-mode'];
            if (savedTunMode !== undefined) {
                const enabled = savedTunMode === 'true';
                setTunMode(enabled);
                tunModeDisplayRef.current = enabled;
                console.log('[Dashboard] 已从数据库加载 tunMode:', enabled);
            }

            setDashboardSettingsLoaded(true);
            console.log('[Dashboard] 看板设置已从数据库加载');
        } catch (e) {
            console.error('[Dashboard] 加载看板设置失败:', e);
            setDashboardSettingsLoaded(true); // 即使失败也标记为已加载
        }
    }, []);

    // 初始化加载
    useEffect(() => {
        loadDashboardSettings();
    }, []);

    // 每次页面激活时重新加载设置（确保从其他页面返回时显示最新值）
    useEffect(() => {
        if (isActive) {
            loadDashboardSettings();
        }
    }, [isActive, loadDashboardSettings]);

    // 定时检测运行状态（不再刷新 configs）
    useEffect(() => {
        // 等待设置加载完成后再开始检测
        if (!settingsLoaded) return;

        checkStatus();
        const timer = setInterval(() => checkStatus(), 5000); // 从3秒改为5秒，减少性能开销
        return () => clearInterval(timer);
    }, [settingsLoaded, apiUrl, apiSecret]); // 注意：不要加入 startTime，否则会循环触发

    useEffect(() => {
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
    }, [isRunning, startTime]);

    useEffect(() => {
        if (!isRunning || !apiUrl) {
            setCurrentTraffic({ up: 0, down: 0 });
            return;
        }

        let ws: WebSocket;
        const connectWs = () => {
            const url = getWsUrl(apiUrl, '/traffic', apiSecret);
            ws = new WebSocket(url);

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    setCurrentTraffic({ up: data.up, down: data.down });
                    setTotalTraffic(prev => ({ up: prev.up + data.up, down: prev.down + data.down }));
                    setTrafficHistory(prev => {
                        const next = [...prev, { up: data.up, down: data.down, time: Date.now() }];
                        if (next.length > 60) next.shift();
                        return next;
                    });
                } catch (e) { }
            };

            ws.onerror = () => ws.close();
            ws.onclose = () => {
                if (isRunning) setTimeout(connectWs, 3000);
            };
        };

        connectWs();
        return () => {
            if (ws) ws.close();
        };
    }, [isRunning, apiUrl, apiSecret]);

    const runStopService = async () => {
        if (coreActionLockRef.current) return;
        coreActionLockRef.current = true;
        setCoreAction('stop');
        setCoreLoading(true);
        try {
            await window.ipcRenderer.core.stop();
            // 直接更新状态，跳过外部 API 检查（刚停止的内核不可能还在运行）
            await checkStatus(true);
        } catch (err: any) {
            console.error('Failed to stop core', err);
            addNotification(`停止内核失败: ${err?.message || '未知错误'}`, 'error');
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
                // 立即开始轮询检查 API 是否可用，最多等待 5 秒
                const ready = await checkApiAfterDelay(5000, 200);
                if (!ready) {
                    throw new Error('启动后 API 5 秒内未就绪，请检查配置或查看内核日志');
                }
                await checkStatus();
            } else {
                throw new Error('请先添加并启用订阅');
            }
        } catch (err: any) {
            console.error('Failed to start core', err);
            addNotification(`启动内核失败: ${err?.message || '未知错误'}`, 'error');
        } finally {
            setCoreLoading(false);
            setCoreAction(null);
            coreActionLockRef.current = false;
        }
    };

    const runRestartService = async () => {
        if (coreActionLockRef.current) return;
        coreActionLockRef.current = true;
        setCoreAction('restart');
        setCoreLoading(true);
        try {
            await window.ipcRenderer.core.restart();
            // 立即开始轮询检查 API 是否可用，最多等待 5 秒
            const ready = await checkApiAfterDelay(5000, 200);
            if (!ready) {
                throw new Error('重启后 API 5 秒内未就绪，请检查配置或查看内核日志');
            }
            // 重启后显式重置 startTime，否则 3 秒轮询可能未在停止窗口触发，计时不会清零
            const newStartTime = await window.ipcRenderer.core.getStartTime();
            setStartTime(newStartTime || Date.now());
            await checkStatus();
            addNotification('内核已重启', 'success');
        } catch (err: any) {
            console.error('Failed to restart core', err);
            addNotification(`重启内核失败: ${err?.message || '未知错误'}`, 'error');
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

    const handleRestartService = async () => {
        if (coreLoading) return;
        runRestartService();
    };

    const handleToggleSystemProxy = async (enable: boolean) => {
        try {
            // 1. 先保存到本地数据库
            await window.ipcRenderer.db.setSetting('dashboard-system-proxy', enable ? 'true' : 'false');
            console.log('[Dashboard] 系统代理状态已保存到数据库:', enable);

            // 2. 更新本地状态
            setSystemProxy(enable);

            // 3. 系统代理是操作系统级别的设置，直接调用即可（不需要判断内核是否运行）
            await window.ipcRenderer.core.setSystemProxy(enable);
            console.log('[Dashboard] 系统代理已', enable ? '开启' : '关闭');
        } catch (err) {
            console.error('Failed to toggle system proxy', err);
        }
    };

    // 检查管理员权限，并在非管理员权限下自动关闭 TUN 模式
    useEffect(() => {
        const checkAdmin = async () => {
            try {
                const admin = await window.ipcRenderer.core.isAdmin();
                console.log('[Dashboard] 管理员权限检查结果:', admin);
                setIsAdmin(admin);

                // 非管理员权限下，如果 TUN 模式是开启的，需要自动关闭
                if (!admin && tunMode) {
                    console.log('[Dashboard] 非管理员权限，自动关闭 TUN 模式');
                    await window.ipcRenderer.db.setSetting('dashboard-tun-mode', 'false');
                    setTunMode(false);
                    tunModeDisplayRef.current = false;
                    // 重新生成配置（不带 TUN）
                    await window.ipcRenderer.core.generateConfig();
                }
            } catch (e) {
                console.error('[Dashboard] 检查管理员权限失败:', e);
                setIsAdmin(false);
            }
        };
        // 等待 tunMode 从数据库加载完成后再检查
        if (dashboardSettingsLoaded) {
            checkAdmin();
        }
    }, [dashboardSettingsLoaded, tunMode]);

    const handleToggleTunMode = async (enable: boolean) => {
        if (tunLoading) return;
        
        // 再次检查管理员权限（防止 UI 状态不同步）
        if (!isAdmin) {
            console.log('[Dashboard] 无管理员权限，禁止切换 TUN 模式');
            addNotification('需要管理员权限才能使用 TUN 模式', 'error');
            return;
        }

        // 1. 先冻结 Switch 显示（保持原状态），再显示 loading
        tunModeDisplayRef.current = tunMode;
        setTunLoading(true);
        try {

            // 2. 保存到本地数据库
            await window.ipcRenderer.db.setSetting('dashboard-tun-mode', enable ? 'true' : 'false');
            console.log('[Dashboard] 虚拟网卡状态已保存到数据库:', enable);

            // 3. 写入 config.json（TUN 配置在 mergeSettingsIntoConfig 中生效，写入时若内核运行中会自动重启）
            await window.ipcRenderer.core.generateConfig();
            // 4. 操作完成后才更新 Switch 显示状态
            setTunMode(enable);
            tunModeDisplayRef.current = enable;
            
            // 5. 提供操作结果反馈
            if (enable) {
                addNotification('TUN 模式已开启，网络流量将通过虚拟网卡处理', 'success');
            } else {
                addNotification('TUN 模式已关闭', 'success');
            }
        } catch (err: any) {
            console.error('Failed to toggle tun mode', err);
            const errorMsg = err?.message || '未知错误';
            addNotification(`虚拟网卡切换失败: ${errorMsg}`, 'error');
        } finally {
            setTunLoading(false);
        }
    };

    // 显示 Toast 提示
    const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
        addNotification(message, type);
    };

    // 将 API 返回的 mode 转换为统一的小写格式
    const normalizeMode = (apiMode: string): string => {
        const mode = apiMode.toLowerCase();
        if (mode === 'rule' || mode === 'global' || mode === 'direct') {
            return mode;
        }
        return 'rule'; // 默认规则模式
    };

    const handleModeChange = async (newMode: string) => {
        if (modeChanging) return; // 防止重复点击
        if (mode === newMode) return; // 模式相同不处理

        setModeChanging(newMode);

        try {
            // 1. 保存到本地数据库
            await window.ipcRenderer.db.setSetting('dashboard-mode', newMode);
            console.log('[Dashboard] 出站模式已保存到数据库:', newMode);

            // 2. 触发重新生成配置文件（配置生成时会读取 dashboard-mode，写入时若内核运行中会自动重启）
            await window.ipcRenderer.core.generateConfig();
            console.log('[Dashboard] 配置文件已重新生成');

            // 更新本地状态
            setMode(newMode);
            showToast(`已切换到${newMode === 'rule' ? '规则' : newMode === 'global' ? '全局' : '直连'}模式`, 'success');

            // 3. 通知托盘菜单更新
            console.log('[Dashboard] 通知托盘更新菜单');
            await window.ipcRenderer.core.updateTrayMenu();
            console.log('[Dashboard] 托盘菜单更新完成');
        } catch (err: any) {
            console.error('[Mode Change] Failed:', err.message);
            showToast(`切换模式失败: ${err.message}`, 'error');
        } finally {
            setModeChanging(null);
        }
    };

    // 使用 ref 保存最新的处理函数，确保托盘事件能调用到最新的函数
    const handleStartServiceRef = useRef(handleStartService);
    const handleStopServiceRef = useRef(handleStopService);
    const handleRestartServiceRef = useRef(handleRestartService);
    const handleModeChangeRef = useRef(handleModeChange);

    useEffect(() => {
        handleStartServiceRef.current = handleStartService;
        handleStopServiceRef.current = handleStopService;
        handleRestartServiceRef.current = handleRestartService;
        handleModeChangeRef.current = handleModeChange;
    });

    // 监听托盘菜单事件（使用 ref 确保只注册一次）
    const trayListenersRef = useRef<{
        onStart: () => void;
        onStop: () => void;
        onRestart: () => void;
        onModeChanged: (_event: any, mode: string) => void;
    } | null>(null);

    useEffect(() => {
        // 如果已经注册过，不再重复注册
        if (trayListenersRef.current) return;

        const onStart = () => handleStartServiceRef.current();
        const onStop = () => handleStopServiceRef.current();
        const onRestart = () => handleRestartServiceRef.current();
        const onModeChanged = (_event: any, mode: string) => handleModeChangeRef.current(mode);

        trayListenersRef.current = { onStart, onStop, onRestart, onModeChanged };

        window.ipcRenderer.on('tray-start-service', onStart);
        window.ipcRenderer.on('tray-stop-service', onStop);
        window.ipcRenderer.on('tray-restart-service', onRestart);
        window.ipcRenderer.on('tray-mode-changed', onModeChanged);

        // 注意：不在这里移除监听器，因为严格模式会重新挂载
    }, []);

    const maxTraffic = Math.max(
        ...trafficHistory.map(d => Math.max(d.up, d.down)),
        1024
    );

    const chartDownFill = 'rgba(111, 138, 122, 0.18)';
    const chartDownStroke = '#6f8a7a';
    const chartUpFill = 'rgba(85, 96, 111, 0.16)';
    const chartUpStroke = '#55606f';

    const createPath = (key: 'up' | 'down') => {
        if (trafficHistory.length === 0) return '';
        const width = 800;
        const height = 200;
        const step = width / 60;

        let path = `M 0 ${height} `;
        trafficHistory.forEach((d, i) => {
            const x = i * step + (60 - trafficHistory.length) * step;
            const y = height - (d[key] / maxTraffic) * height * 0.9;
            path += `L ${x} ${y} `;
        });

        if (trafficHistory.length > 0) {
            const lastX = (60 - 1) * step;
            const lastY = height - (trafficHistory[trafficHistory.length - 1][key] / maxTraffic) * height * 0.9;
            path += `L ${800} ${lastY} L 800 ${height} Z`;
        }
        return path;
    };

    return (
        <div className="page-shell text-[var(--app-text-secondary)]">

            <div className="page-header" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
                <div>
                    <h1 className="page-title">仪表盘</h1>
                    <p className="page-subtitle">内核启停、出站模式切换、流量监控与网络检测。</p>
                </div>
                <div className="toolbar" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    <div className="flex items-center gap-2">
                        <Badge tone={coreLoading ? 'neutral' : isRunning ? 'success' : 'warning'}>
                            {coreLoading ? (
                                <span className="flex items-center gap-1.5">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    {coreAction === 'stop' ? '关闭中' : coreAction === 'restart' ? '重启中' : '启动中'}
                                </span>
                            ) : isRunning ? 'Core Connected' : 'Core Offline'}
                        </Badge>
                        {isRunning && !coreLoading && (
                            <button
                                type="button"
                                onClick={handleRestartService}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[var(--app-text-tertiary)] hover:bg-[var(--app-divider)] hover:text-[var(--app-text-secondary)] transition-colors"
                                title="修改配置后重启内核以生效"
                            >
                                <RefreshCw className="w-3 h-3" />
                                重启
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="page-content">
                <div className="grid grid-cols-3 gap-4">
                    <Card className="col-span-2 flex flex-col min-h-[200px]">
                        <div className="panel-header">
                            <div className="panel-title">
                                <span className="panel-title-icon">
                                    <Activity className="w-3.5 h-3.5" />
                                </span>
                                <span>实时流量</span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] font-mono tracking-tight text-[var(--app-text-quaternary)]">
                                <Badge tone="neutral">↑ {formatBytes(currentTraffic.up)}/s</Badge>
                                <Badge tone="neutral">↓ {formatBytes(currentTraffic.down)}/s</Badge>
                            </div>
                        </div>
                        <div className="flex-1 relative bg-[linear-gradient(180deg,rgba(255,255,255,0.42),rgba(248,249,251,0.18))]">
                            <div className="absolute inset-x-4 top-4 flex items-center justify-between text-[11px] text-[var(--app-text-quaternary)]">
                                <span>最近 60 秒</span>
                                <span className="font-mono">峰值 {formatBytes(maxTraffic)}/s</span>
                            </div>
                            <svg preserveAspectRatio="none" viewBox="0 0 800 200" className="w-full h-full absolute bottom-0 left-0">
                                <path d="M 0 50 L 800 50 M 0 100 L 800 100 M 0 150 L 800 150" stroke="rgba(23,26,33,0.06)" strokeWidth="1" strokeDasharray="4 6" fill="none" />
                                <path d={createPath('down')} fill={chartDownFill} stroke={chartDownStroke} strokeWidth="1.6" strokeLinejoin="round" />
                                <path d={createPath('up')} fill={chartUpFill} stroke={chartUpStroke} strokeWidth="1.6" strokeLinejoin="round" />
                            </svg>
                        </div>
                    </Card>

                    <div className="flex flex-col gap-4">
                        <Card className="p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="panel-title">
                                        <span className="panel-title-icon">
                                            <Shuffle className="w-3.5 h-3.5" />
                                        </span>
                                        <span>系统代理</span>
                                    </div>
                                    <p className="text-[12px] text-[var(--app-text-quaternary)] mt-2">将系统出口切换到当前内核。</p>
                                </div>
                                <Switch checked={systemProxy} onCheckedChange={handleToggleSystemProxy} />
                            </div>
                        </Card>

                        <Card className="p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="panel-title">
                                        <span className="panel-title-icon">
                                            <Network className="w-3.5 h-3.5" />
                                        </span>
                                        <span>虚拟网卡</span>
                                    </div>
                                    <p className="text-[12px] text-[var(--app-text-quaternary)] mt-2">
                                        {!isAdmin 
                                            ? '需要以管理员身份运行程序才能使用 TUN 模式。'
                                            : 'TUN 模式需要管理员权限才能正常工作。'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {tunLoading && <Loader2 className="w-4 h-4 animate-spin text-[var(--app-text-quaternary)]" />}
                                    <Switch
                                        checked={tunLoading ? tunModeDisplayRef.current : tunMode}
                                        onCheckedChange={handleToggleTunMode}
                                        disabled={tunLoading || !isAdmin}
                                    />
                                </div>
                            </div>
                        </Card>


                    </div>

                    <Card className="p-4">
                        <div className="panel-title mb-3">
                            <span className="panel-title-icon">
                                <GitBranch className="w-3.5 h-3.5" />
                            </span>
                            <span>出站模式</span>
                        </div>
                        <div className="space-y-2">
                            {[
                                { id: 'rule', label: '规则', desc: '按规则智能分流' },
                                { id: 'global', label: '全局', desc: '所有流量走代理' },
                                { id: 'direct', label: '直连', desc: '所有流量直连' }
                            ].map(m => (
                                <button
                                    key={m.id}
                                    disabled={modeChanging !== null}
                                    className={cn(
                                        "w-full flex items-center gap-2 rounded-[14px] px-3 py-2 text-left transition-all border",
                                        mode === m.id
                                            ? "border-[var(--app-accent-border)] bg-[var(--app-accent-soft-card)] text-[var(--app-text)]"
                                            : "border-[var(--app-stroke)] bg-white/40 text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)]",
                                        modeChanging !== null && modeChanging !== m.id && "opacity-50 cursor-not-allowed"
                                    )}
                                    onClick={() => handleModeChange(m.id)}
                                >
                                    <span className={cn(
                                        "flex h-4 w-4 items-center justify-center rounded-full border transition-colors shrink-0",
                                        mode === m.id
                                            ? "border-[var(--app-accent)] bg-[var(--app-accent)] shadow-[inset_0_0_0_3px_rgba(255,255,255,0.88)]"
                                            : "border-[var(--app-stroke-strong)] bg-[rgba(255,255,255,0.5)]"
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

                    <Card className="p-4 min-h-[180px]">
                        <div className="flex items-center gap-2 mb-3">
                            <Wifi className="w-4 h-4 text-[var(--app-text-secondary)]" />
                            <span className="text-[13px] font-medium text-[var(--app-text-secondary)]">网络检测</span>
                            <button
                                onClick={() => setShowNetworkTip(true)}
                                className="p-0.5 hover:bg-[var(--app-hover)] rounded-full transition-colors"
                                title="提示"
                            >
                                <svg className="w-4 h-4 text-[var(--app-text-quaternary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M12 16v-4" />
                                    <path d="M12 8h.01" />
                                </svg>
                            </button>
                        </div>
                        {networkInfo ? (
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-7 rounded overflow-hidden shadow-sm flex-shrink-0" title={networkInfo.country}>
                                    {(() => {
                                        const code = networkInfo.countryCode;
                                        const FlagComponent = (FlagIcons as Record<string, React.ComponentType<{ className?: string }>>)[code];
                                        return FlagComponent ? <FlagComponent className="w-full h-full object-cover" /> : <div className="w-full h-full bg-[var(--app-accent)] text-white flex items-center justify-center text-[10px] font-bold">{code}</div>;
                                    })()}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[14px] text-[var(--app-text-secondary)] font-mono">{networkInfo.ip}</span>
                                    <span className="text-[11px] text-[var(--app-text-quaternary)]">{networkInfo.country}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-[var(--app-surface)] flex items-center justify-center">
                                    <Globe className="w-5 h-5 text-[var(--app-text-quaternary)]" />
                                </div>
                                <span className="text-[13px] text-[var(--app-text-quaternary)]">检测中...</span>
                            </div>
                        )}
                    </Card>

                    <Card className="p-4">
                        <div className="panel-title mb-3">
                            <span className="panel-title-icon">
                                <PieChart className="w-3.5 h-3.5" />
                            </span>
                            <span>流量统计</span>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <div className="relative w-16 h-16 ml-1">
                                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                    <path
                                        strokeWidth="5"
                                        stroke="rgba(23,26,33,0.08)"
                                        fill="none"
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    />
                                    {/* 下载流量环 */}
                                    <path
                                        strokeDasharray={`${Math.min((totalTraffic.down / Math.max(totalTraffic.up + totalTraffic.down, 1)) * 100, 100)}, 100`}
                                        strokeWidth="5"
                                        strokeLinecap="round"
                                        stroke={chartDownStroke}
                                        fill="none"
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    />
                                    {/* 上传流量环 */}
                                    <path
                                        strokeDasharray={`${Math.min((totalTraffic.up / Math.max(totalTraffic.up + totalTraffic.down, 1)) * 100, 100)}, 100`}
                                        strokeWidth="5"
                                        strokeLinecap="round"
                                        stroke={chartUpStroke}
                                        fill="none"
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    />
                                </svg>
                            </div>

                            <div className="flex flex-col gap-3 text-[11px] font-mono min-w-[110px]">
                                <div className="flex items-center gap-2 text-[var(--app-text-quaternary)]">
                                    <span className="w-3 h-[3px] rounded-full bg-[#55606f]" />
                                    <span>上传</span>
                                </div>
                                <div className="flex items-center gap-2 text-[var(--app-text-quaternary)]">
                                    <span className="w-3 h-[3px] rounded-full bg-[#6f8a7a]" />
                                    <span>下载</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] font-mono">
                            <div className="rounded-[14px] border border-[var(--app-divider)] bg-white/35 px-3 py-2 text-[var(--app-text-quaternary)]">
                                ↑ {formatBytes(totalTraffic.up)}
                            </div>
                            <div className="rounded-[14px] border border-[var(--app-divider)] bg-white/35 px-3 py-2 text-[var(--app-text-quaternary)]">
                                ↓ {formatBytes(totalTraffic.down)}
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            {isRunning && !coreLoading && uptime && (
                <div className="fixed right-[20px] bottom-[82px] z-30 rounded-[10px] border border-[var(--app-divider)] bg-white/85 px-2 py-1 text-[11px] font-mono text-[var(--app-text-quaternary)] shadow-sm backdrop-blur">
                    {uptime}
                </div>
            )}

            <button
                onClick={isRunning ? handleStopService : handleStartService}
                disabled={coreLoading}
                className={cn(
                    "floating-action",
                    isLoaded && "transition-all duration-300",
                    "w-[52px] h-[52px]",
                    coreLoading && "opacity-80"
                )}
            >
                {coreLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                ) : isRunning ? (
                    <Pause className="w-5 h-5 fill-current" />
                ) : (
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
            </button>

            {/* Notification */}
            <NotificationList notifications={notifications} onRemove={removeNotification} />

            {/* 网络检测说明弹窗 */}
            {showNetworkTip && (
                <div
                    className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center"
                    onClick={() => setShowNetworkTip(false)}
                >
                    <div
                        className="bg-white rounded-[14px] p-5 max-w-[280px] shadow-xl animate-in fade-in zoom-in duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <svg className="w-5 h-5 text-[var(--app-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 16v-4" />
                                <path d="M12 8h.01" />
                            </svg>
                            <span className="text-[14px] font-medium text-[var(--app-text-secondary)]">说明</span>
                        </div>
                        <p className="text-[13px] text-[var(--app-text-tertiary)] leading-relaxed">
                            依赖第三方 API 检测，仅供参考
                        </p>
                        <button
                            onClick={() => setShowNetworkTip(false)}
                            className="mt-4 w-full py-2 rounded-[10px] bg-[var(--app-accent)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
                        >
                            确定
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
}
