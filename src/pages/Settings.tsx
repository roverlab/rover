import React, { useState, useEffect } from 'react';
import { Switch } from '../components/ui/Switch';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Field';
import { Input } from '../components/ui/Field';
import { Card, ListRow, SectionHeader } from '../components/ui/Surface';
import { Modal } from '../components/ui/Modal';
import { useApi } from '../contexts/ApiContext';
import { useProfile } from '../contexts/ProfileContext';
import { Settings as SettingsIcon, Sliders, Check, Globe, Download, Upload, Info, ExternalLink } from 'lucide-react';
import { DnsServersTab } from './Settings/DnsServersTab';
import { useOverrideRules } from '../contexts/OverrideRulesContext';

interface SettingsProps {
  isActive?: boolean;
  initialTab?: 'basic' | 'advanced' | 'dns' | 'about' | null;
  onTabConsumed?: () => void;
}


export function Settings({ isActive = true, initialTab, onTabConsumed }: SettingsProps = {}) {
  const { apiUrl, apiSecret, setApiUrl, setApiSecret } = useApi();
  const { refreshOverrideRules } = useOverrideRules();
  const { refreshSeed } = useProfile();

  // App Settings
  const [lang, setLang] = useState('en');

  // Core & System Settings
  const [allowLan, setAllowLan] = useState(false);
  const [port, setPort] = useState(7890);
  const [logLevel, setLogLevel] = useState('warn');
  const [isRunning, setIsRunning] = useState(false);

  // Advanced - Rule Override
  const [overrideRules, setOverrideRules] = useState(false);

  // Advanced - Custom Proxy Groups
  const [customProxyGroups, setCustomProxyGroups] = useState(false);

  // 订阅下载 User-Agent
  const [subscriptionUserAgent, setSubscriptionUserAgent] = useState('');

  // 启动时自动打开内核（默认 true）
  const [autoStartProxy, setAutoStartProxy] = useState(true);

  // IPv6 开关（默认 false）
  const [ipv6, setIpv6] = useState(false);

  // Build info
  const [appVersion, setAppVersion] = useState('v1.0.0');
  const [singboxVersion, setSingboxVersion] = useState('sing-box 1.8.0');
  const [buildTime, setBuildTime] = useState('');

  // Hosts 配置（数组存储，每行一个元素）
  const [hostsText, setHostsText] = useState('');
  const [hostsSaved, setHostsSaved] = useState(false);

  // TUN 排除地址配置（数组存储，每行一个元素）
  const [tunExcludeAddressText, setTunExcludeAddressText] = useState('');
  const [tunExcludeAddressSaved, setTunExcludeAddressSaved] = useState(false);

  // 配置导出/导入
  const [configExporting, setConfigExporting] = useState(false);
  const [configImporting, setConfigImporting] = useState(false);
  const [configImportError, setConfigImportError] = useState<string | null>(null);
  const [configExportError, setConfigExportError] = useState<string | null>(null);
  const [configImportSuccessModal, setConfigImportSuccessModal] = useState(false);
  const [configImportStep, setConfigImportStep] = useState<string | null>(null);

  // RoverService 状态 (支持的系统)
  const [roverserviceStatus, setRoverServiceStatus] = useState<{
    platform: string;
    supported: boolean;
    socketAvailable: boolean;
    binaryInstalled: boolean;
    serviceLoaded: boolean;
    running: boolean;
    pid?: number;
    version?: string;
  } | null>(null);
  const [roverserviceInstalling, setRoverServiceInstalling] = useState(false);
  const [roverserviceUninstalling, setRoverServiceUninstalling] = useState(false);
  const [roverserviceError, setRoverServiceError] = useState<string | null>(null);

  const loadSettings = async () => {
    try {
      const allSettings = await window.ipcRenderer.db.getAllSettings();

      const portVal = allSettings['mixed-port'] || '7890';
      const lanVal = allSettings['allow-lan'] || 'false';
      const logVal = allSettings['log-level'] || 'warn';
      const urlVal = allSettings['api-url'] || 'http://127.0.0.1:9090';
      const secretVal = allSettings['api-secret'] || '';
      const overrideRulesVal = allSettings['override-rules'] || 'false';
      const customProxyGroupsVal = allSettings['custom-proxy-groups'] || 'false';
      const subscriptionUserAgentVal = allSettings['subscription-user-agent'] || '';
      const autoStartProxyVal = allSettings['auto-start-proxy'] ?? 'true';
      const ipv6Val = allSettings['ipv6'] ?? 'false';

      setPort(parseInt(portVal, 10) || 7890);
      setAllowLan(lanVal === 'true');
      setLogLevel(logVal === 'warning' ? 'warn' : logVal);
      setApiUrl(urlVal);
      setApiSecret(secretVal);
      setOverrideRules(overrideRulesVal === 'true');
      setCustomProxyGroups(customProxyGroupsVal === 'true');
      setSubscriptionUserAgent(subscriptionUserAgentVal);
      setAutoStartProxy(autoStartProxyVal === 'true');
      setIpv6(ipv6Val === 'true');

      // Hosts 配置（数组存储）
      const hostsVal = allSettings['hosts-override'] || '[]';
      try {
        const arr = JSON.parse(hostsVal);
        setHostsText(Array.isArray(arr) ? arr.filter((s: unknown) => typeof s === 'string').join('\n') : '');
      } catch {
        setHostsText('');
      }

      // TUN 排除地址配置（数组存储）
      const tunExcludeVal = allSettings['tun-exclude-address'] || '[]';
      try {
        const arr = JSON.parse(tunExcludeVal);
        setTunExcludeAddressText(Array.isArray(arr) ? arr.filter((s: unknown) => typeof s === 'string').join('\n') : '');
      } catch {
        setTunExcludeAddressText('');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const checkStatus = async () => {
    try {
      const running = await window.ipcRenderer.core.isRunning();
      setIsRunning(running);
    } catch (err: any) {
      console.error('Failed to connect to core API.');
    }
  };

  const loadBuildInfo = async () => {
    try {
      const buildInfo = await window.ipcRenderer.core.getBuildInfo();
      // Display version as: v1.0.2-abc123d format
      const versionDisplay = buildInfo.commitSha && buildInfo.commitSha !== 'local'
        ? `v${buildInfo.appVersion}-${buildInfo.commitSha}`
        : `v${buildInfo.appVersion}`;
      setAppVersion(versionDisplay);
      setSingboxVersion(`sing-box ${buildInfo.singboxVersion}`);
      
      // Format build time to local readable format
      if (buildInfo.buildTime) {
        const date = new Date(buildInfo.buildTime);
        const formattedTime = date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
        setBuildTime(formattedTime);
      }
    } catch (err: any) {
      console.error('Failed to load build info:', err);
      // Keep default versions on error
    }
  };

  // 加载 RoverService 状态
  const loadRoverServiceStatus = async () => {
    try {
      const status = await window.ipcRenderer.roverservice.getInstallationStatus();
      setRoverServiceStatus(status);

    } catch (err: any) {
      console.error('Failed to load RoverService status:', err);
    }
  };

  // 每次进入设置页时刷新数据
  useEffect(() => {
    if (!isActive) return;
    loadSettings();
    checkStatus();
    loadBuildInfo();
    loadRoverServiceStatus();
    const timer = setInterval(checkStatus, 3000);
    return () => clearInterval(timer);
  }, [isActive]);

  // 导入进度提示
  useEffect(() => {
    const unsub = window.ipcRenderer.onConfigImportStep((step) => setConfigImportStep(step));
    return unsub;
  }, []);

  const handleExportConfig = async () => {
    setConfigExporting(true);
    setConfigExportError(null);
    try {
      const result = await window.ipcRenderer.config.export();
      if (!result.ok) {
        // 用户取消，不显示错误
      }
    } catch (e: any) {
      setConfigExportError(e?.message || '导出失败');
    } finally {
      setConfigExporting(false);
    }
  };

  const handleImportConfig = async () => {
    setConfigImporting(true);
    setConfigImportError(null);
    setConfigImportStep(null);
    try {
      const result = await window.ipcRenderer.config.import();
      if (result.ok) {
        setConfigImportSuccessModal(true);
      }
    } catch (e: any) {
      setConfigImportError(e?.message || '导入失败');
    } finally {
      setConfigImporting(false);
      setConfigImportStep(null);
    }
  };

  const CONFIG_IMPORT_STEP_LABELS: Record<string, string> = {
    restoring: '正在恢复配置...',
    downloading: '正在下载订阅配置...',
    generating: '正在生成主配置...',
    done: '处理完成',
  };

  const handleImportSuccessConfirm = () => {
    setConfigImportSuccessModal(false);
    window.location.reload();
  };

  const handleUpdateConfig = async (key: string, value: any) => {
    try {
      // Save to database
      await window.ipcRenderer.db.setSetting(key, value.toString());

      // Update state locally
      if (key === 'allow-lan') setAllowLan(value);
      if (key === 'log-level') setLogLevel(value);
      if (key === 'mixed-port') setPort(value);
      if (key === 'api-url') setApiUrl(value);
      if (key === 'api-secret') setApiSecret(value);
      if (key === 'subscription-user-agent') setSubscriptionUserAgent(value);
      if (key === 'auto-start-proxy') setAutoStartProxy(value);
      if (key === 'ipv6') setIpv6(value);
      if (key === 'custom-proxy-groups') {
        setCustomProxyGroups(value);
        // 刷新代理页面以显示更新后的代理组
        refreshSeed();
      }

      // 订阅 User-Agent 和启动自动打开内核 不影响 config.json，无需重新生成
      if (key === 'subscription-user-agent' || key === 'auto-start-proxy') return;

      // Regenerate config.json（写入时若内核运行中会自动重启）
      window.ipcRenderer.core.generateConfig();
    } catch (err) {
      console.error('Failed to update config', err);
    }
  };

  const handleSaveOverrideRules = async () => {
    try {
      await window.ipcRenderer.db.setSetting('override-rules', overrideRules.toString());
      await refreshOverrideRules();
      await regenerateConfigIfNeeded();
    } catch (e: any) {
      console.error('Failed to save override-rules', e);
    }
  };

  const regenerateConfigIfNeeded = async () => {
    window.ipcRenderer.core.generateConfig();
  };

  // 保存 Hosts 配置（数组存储，原样保存不修改内容，解析时再处理）
  const handleSaveHosts = async () => {
    const lines = hostsText.split(/\r?\n/);
    await window.ipcRenderer.db.setSetting('hosts-override', JSON.stringify(lines));
    setHostsSaved(true);
    setTimeout(() => setHostsSaved(false), 3000);
    await regenerateConfigIfNeeded();
  };

  // 保存 TUN 排除地址配置（数组存储，原样保存不修改内容，解析时再处理）
  const handleSaveTunExcludeAddress = async () => {
    const lines = tunExcludeAddressText.split(/\r?\n/);
    await window.ipcRenderer.db.setSetting('tun-exclude-address', JSON.stringify(lines));
    setTunExcludeAddressSaved(true);
    setTimeout(() => setTunExcludeAddressSaved(false), 3000);
    await regenerateConfigIfNeeded();
  };

  // RoverService 安装处理
  const handleInstallRoverService = async () => {
    setRoverServiceInstalling(true);
    setRoverServiceError(null);
    try {
      // 不需要传路径，会自动从应用资源目录查找
      const result = await window.ipcRenderer.roverservice.install();
      if (result.success) {

        // 卸载服务后自动关闭 TUN 模式
        await window.ipcRenderer.db.setSetting('dashboard-tun-mode', 'true');


        await loadRoverServiceStatus();

        window.ipcRenderer.core.generateConfig();
      } else {
        // 用户拒绝安装服务（取消 UAC 提示），不显示错误提示
        if (!result.isUserCanceled) {
          setRoverServiceError(result.error || '安装失败');
        }
      }
    } catch (err: any) {
      setRoverServiceError(err.message || '安装失败');
    } finally {
      setRoverServiceInstalling(false);
    }
  };

  // RoverService 卸载处理
  const handleUninstallRoverService = async () => {
    setRoverServiceUninstalling(true);
    setRoverServiceError(null);
    try {
      const result = await window.ipcRenderer.roverservice.uninstall();
      if (result.success) {
        // 卸载服务后自动关闭 TUN 模式
        await window.ipcRenderer.db.setSetting('dashboard-tun-mode', 'false');
        // 重新生成配置
        await loadRoverServiceStatus();

        window.ipcRenderer.core.generateConfig();

      } else {
        // 用户拒绝卸载服务（取消 UAC 提示），不显示错误提示
        if (!result.isUserCanceled) {
          setRoverServiceError(result.error || '卸载失败');
        }
      }
    } catch (err: any) {
      setRoverServiceError(err.message || '卸载失败');
    } finally {
      setRoverServiceUninstalling(false);
    }
  };

  // 重新安装 RoverService
  const handleReinstallRoverService = async () => {
    setRoverServiceInstalling(true);
    setRoverServiceError(null);
    try {
      // 先卸载
      const uninstallResult = await window.ipcRenderer.roverservice.uninstall();
      if (!uninstallResult.success) {
        // 卸载失败也继续尝试安装
        console.warn('[RoverService] 卸载失败，尝试重新安装:', uninstallResult.error);
      } 
      // 重新加载状态
      await loadRoverServiceStatus();
      // 再安装
      const installResult = await window.ipcRenderer.roverservice.install();
      if (installResult.success) {

         // 卸载成功，自动关闭 TUN 模式
        await window.ipcRenderer.db.setSetting('dashboard-tun-mode', 'true');
        
        await loadRoverServiceStatus();

        // 重新生成配置以应用最新的服务状态
        window.ipcRenderer.core.generateConfig();
      } else {
        // 用户拒绝安装服务（取消 UAC 提示），不显示错误提示
        if (!installResult.isUserCanceled) {
          setRoverServiceError(installResult.error || '重新安装失败');
        }
      }
    } catch (err: any) {
      setRoverServiceError(err.message || '重新安装失败');
    } finally {
      setRoverServiceInstalling(false);
    }
  };

  // Tab 切换
  type SettingsTab = 'basic' | 'advanced' | 'dns' | 'about';
  const [activeTab, setActiveTab] = useState<SettingsTab>('basic');

  // 当从引导页跳转过来时，自动切换到对应 Tab
  useEffect(() => {
    if (initialTab === 'advanced' || initialTab === 'dns' || initialTab === 'about') {
      setActiveTab(initialTab);
      onTabConsumed?.();
    }
  }, [initialTab]);

  return (
    <div className="page-shell">
      <div className="page-header shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div>
          <h1 className="page-title">设置</h1>
          <p className="page-subtitle">配置 API 地址、端口、DNS 与高级分流策略。</p>
        </div>
        <div className="toolbar" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        </div>
      </div>

      <div className="page-content">
        {/* Tab 导航 */}
        <div className="flex gap-1 mb-4 p-1 bg-[rgba(39,44,54,0.06)] rounded-xl w-fit">
          {[
            { id: 'basic' as SettingsTab, label: '基础设置', icon: SettingsIcon },
            { id: 'advanced' as SettingsTab, label: '高级设置', icon: Sliders },
            { id: 'dns' as SettingsTab, label: 'DNS 服务器', icon: Globe },
            { id: 'about' as SettingsTab, label: '关于', icon: Info },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium rounded-lg transition-colors ${
                activeTab === id
                  ? 'bg-white text-[var(--app-text)] shadow-sm'
                  : 'text-[var(--app-text-tertiary)] hover:text-[var(--app-text)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* 基础设置 Tab */}
        {activeTab === 'basic' && (
        <div className="max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

          {/* 服务端配置 */}
          <div className="space-y-5">
            <Card>
              <SectionHeader>
                <div>
                  <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-quaternary)]">服务端配置</h2>
                  <p className="text-[12px] text-[var(--app-text-quaternary)] mt-1">与核心进程直接关联的参数。</p>
                </div>
              </SectionHeader>
              <div className="panel-section">
                <ListRow>
                  <div>
                    <div className="list-row-title">端口</div>
                    <div className="list-row-description">Mixed Port (HTTP/SOCKS)</div>
                  </div>
                  <Input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                    onBlur={() => handleUpdateConfig('mixed-port', port)}
                    className="w-[100px]"
                  />
                </ListRow>

                <ListRow>
                  <div>
                    <div className="list-row-title">局域网访问</div>
                    <div className="list-row-description">Allow LAN connections</div>
                  </div>
                  <Switch
                    checked={allowLan}
                    onCheckedChange={(v) => handleUpdateConfig('allow-lan', v)}
                  />
                </ListRow>

                <ListRow>
                  <div>
                    <div className="list-row-title">日志级别</div>
                    <div className="list-row-description">Service diagnostic level</div>
                  </div>
                  <Select
                    value={logLevel}
                    onChange={(e) => handleUpdateConfig('log-level', e.target.value)}
                    className="w-[132px]"
                  >
                    <option value="debug">debug</option>
                    <option value="info">info</option>
                    <option value="warn">warn</option>
                    <option value="error">error</option>
                    <option value="fatal">fatal</option>
                  </Select>
                </ListRow>

                <ListRow>
                  <div>
                    <div className="list-row-title">API 地址</div>
                    <div className="list-row-description">External controller URL</div>
                  </div>
                  <Input
                    type="text"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    onBlur={() => handleUpdateConfig('api-url', apiUrl)}
                    placeholder="http://127.0.0.1:9090"
                    className="w-[180px]"
                  />
                </ListRow>

                <ListRow>
                  <div>
                    <div className="list-row-title">API 密钥</div>
                    <div className="list-row-description">External controller secret</div>
                  </div>
                  <Input
                    type="password"
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    onBlur={() => handleUpdateConfig('api-secret', apiSecret)}
                    placeholder="Optional"
                    className="w-[180px]"
                  />
                </ListRow>
              </div>
            </Card>
          </div>

          {/* 应用配置 */}
          <div className="space-y-5">
            <Card>
              <SectionHeader>
                <div>
                  <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-quaternary)]">应用配置</h2>
                  <p className="text-[12px] text-[var(--app-text-quaternary)] mt-1">应用程序相关的设置选项。</p>
                </div>
              </SectionHeader>
              <div className="panel-section">
                <ListRow>
                  <div>
                    <div className="list-row-title">订阅下载 User-Agent</div>
                    <div className="list-row-description">下载订阅配置时使用的 HTTP 请求头，留空使用默认值</div>
                  </div>
                  <Input
                    type="text"
                    value={subscriptionUserAgent}
                    onChange={(e) => setSubscriptionUserAgent(e.target.value)}
                    onBlur={() => handleUpdateConfig('subscription-user-agent', subscriptionUserAgent)}
                    placeholder="mihomo/1.19.16; sing-box 1.12.0"
                    className="min-w-[200px] flex-1 max-w-[320px]"
                  />
                </ListRow>

                <ListRow>
                  <div>
                    <div className="list-row-title">启动自动打开内核</div>
                    <div className="list-row-description">应用启动时自动打开内核</div>
                  </div>
                  <Switch
                    checked={autoStartProxy}
                    onCheckedChange={(v) => handleUpdateConfig('auto-start-proxy', v)}
                  />
                </ListRow>

                <ListRow>
                  <div>
                    <div className="list-row-title">主题</div>
                    <div className="list-row-description">Light / Dark mode</div>
                  </div>
                  <Select
                    defaultValue="light"
                    className="w-[132px]"
                  >
                    <option value="light">Light</option>
                    <option value="dark" disabled>Dark (未支持)</option>
                  </Select>
                </ListRow>

                <ListRow>
                  <div>
                    <div className="list-row-title">语言</div>
                    <div className="list-row-description">UI Language</div>
                  </div>
                  <Select
                    value={lang}
                    onChange={(e) => setLang(e.target.value)}
                    className="w-[132px]"
                  >
                    <option value="en">English</option>
                    <option value="zh">中文</option>
                  </Select>
                </ListRow>
              </div>
            </Card>
          </div>
        </div>
        )}

        {/* 高级设置 Tab */}
        {activeTab === 'advanced' && (
        <div className="max-w-5xl space-y-5">
            <Card>
              <SectionHeader>
                <div>
                  <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-quaternary)]">高级设置</h2>
                  <p className="text-[12px] text-[var(--app-text-quaternary)] mt-1">DNS解析与网络高级选项配置。</p>
                </div>
              </SectionHeader>
              <div className="panel-section">
                <ListRow>
                  <div>
                    <div className="list-row-title">自定义分流策略</div>
                    <div className="list-row-description">使用自定义的分流策略替换订阅中的规则</div>
                  </div>
                  <Switch
                    checked={overrideRules}
                    onCheckedChange={async (v) => {
                      setOverrideRules(v);
                      try {
                        await window.ipcRenderer.db.setSetting('override-rules', v.toString());
                        await refreshOverrideRules();
                        await regenerateConfigIfNeeded();
                      } catch (e) {
                        console.error('Failed to save override-rules', e);
                      }
                    }}
                  />
                </ListRow>

                <ListRow>
                  <div>
                    <div className="list-row-title">自定义代理分组</div>
                    <div className="list-row-description">使用自定义的代理分组替换订阅中的原始分组</div>
                  </div>
                  <Switch
                    checked={customProxyGroups}
                    onCheckedChange={(v) => handleUpdateConfig('custom-proxy-groups', v)}
                  />
                </ListRow>

                <ListRow>
                  <div>
                    <div className="list-row-title">IPv6</div>
                    <div className="list-row-description">Enable IPv6 support</div>
                  </div>
                  <Switch
                    checked={ipv6}
                    onCheckedChange={(v) => handleUpdateConfig('ipv6', v)}
                  />
                </ListRow>

                <ListRow className="flex-col items-stretch gap-2 py-3">
                  <div>
                    <div className="list-row-title">Hosts 配置</div>
                    <div className="list-row-description">类似 hosts格式，每行：IP + 空格/制表符 + 域名，支持 IPv4/IPv6（如 ::1）及泛解析（*.example.com）</div>
                  </div>
                  <div className="w-full">
                    <textarea
                      value={hostsText}
                      onChange={(e) => setHostsText(e.target.value)}
                      placeholder={`# 支持注释
127.0.0.1   localhost
::1         localhost
127.0.0.1   *.example.com`}
                      rows={6}
                      className="w-full px-3 py-2 text-[13px] font-mono rounded-[10px] resize-y bg-white text-[var(--app-text)] placeholder:text-[var(--app-text-quaternary)] input-field focus:border-[var(--app-stroke-strong)] focus:outline-none"
                    />
                    <div className="flex items-center gap-2 mt-2 justify-end">
                      {hostsSaved && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-green-600">
                          <Check className="w-3 h-3" />
                          已保存
                        </span>
                      )}
                      <Button variant="secondary" size="sm" onClick={handleSaveHosts}>
                        保存
                      </Button>
                    </div>
                  </div>
                </ListRow>

                <ListRow className="flex-col items-stretch gap-2 py-3">
                  <div>
                    <div className="list-row-title">TUN 排除地址</div>
                    <div className="list-row-description">在 TUN 模式下排除的 IP 地址范围，每行一个 CIDR（如 192.168.0.0/16），这些地址的流量将不经过 TUN 虚拟网卡</div>
                  </div>
                  <div className="w-full">
                    <textarea
                      value={tunExcludeAddressText}
                      onChange={(e) => setTunExcludeAddressText(e.target.value)}
                      placeholder={`# 支持注释
192.168.0.0/16
10.0.0.0/8
172.16.0.0/12
fc00::/7`}
                      rows={6}
                      className="w-full px-3 py-2 text-[13px] font-mono rounded-[10px] resize-y bg-white text-[var(--app-text)] placeholder:text-[var(--app-text-quaternary)] input-field focus:border-[var(--app-stroke-strong)] focus:outline-none"
                    />
                    <div className="flex items-center gap-2 mt-2 justify-end">
                      {tunExcludeAddressSaved && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-green-600">
                          <Check className="w-3 h-3" />
                          已保存
                        </span>
                      )}
                      <Button variant="secondary" size="sm" onClick={handleSaveTunExcludeAddress}>
                        保存
                      </Button>
                    </div>
                  </div>
                </ListRow>

              </div>
            </Card>
        </div>
        )}

        {/* DNS 服务器 Tab */}
        {activeTab === 'dns' && (
          <DnsServersTab isActive={isActive} onRegenerateConfig={regenerateConfigIfNeeded} />
        )}

        {/* 关于 Tab */}
        {activeTab === 'about' && (
          <div className="max-w-5xl space-y-5">
            <Card>
              <SectionHeader>
                <div>
                  <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-quaternary)]">关于</h2>
                  <p className="text-[12px] text-[var(--app-text-quaternary)] mt-1">应用版本、主目录与配置备份。</p>
                </div>
              </SectionHeader>
              <div className="panel-section">
                <ListRow>
                  <div>
                    <div className="list-row-title">应用名称</div>
                    <div className="list-row-description font-medium">Rover</div>
                  </div>
                </ListRow>
                <ListRow>
                  <div>
                    <div className="list-row-title">应用版本</div>
                    <div className="list-row-description">
                      <div className="flex flex-col gap-0.5">
                        <div className="font-medium">{appVersion}</div>
                        {buildTime && <div className="text-xs text-[var(--app-text-quaternary)]">{buildTime}</div>}
                      </div>
                    </div>
                  </div>
                </ListRow>
                <ListRow>
                  <div>
                    <div className="list-row-title">内核版本</div>
                    <div className="list-row-description">{singboxVersion}</div>
                  </div>
                </ListRow>
                <ListRow>
                  <div>
                    <div className="list-row-title">项目链接</div>
                    <div className="list-row-description">GitHub 开源仓库</div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => window.ipcRenderer.core.openExternalUrl('https://github.com/roverlab/rover')}
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1" />
                    打开
                  </Button>
                </ListRow>
                <ListRow>
                  <div>
                    <div className="list-row-title">主目录</div>
                    <div className="list-row-description">UserData folder</div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => window.ipcRenderer.core.openUserDataPath()}>打开</Button>
                </ListRow>
                <ListRow>
                  <div>
                    <div className="list-row-title">导出/导入配置</div>
                    <div className="list-row-description">备份或恢复数据</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleExportConfig}
                      disabled={configExporting}
                    >
                      <Download className="w-3.5 h-3.5 mr-1" />
                      导出
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleImportConfig}
                      disabled={configImporting}
                    >
                      <Upload className="w-3.5 h-3.5 mr-1" />
                      导入
                    </Button>
                    {configImporting && configImportStep && configImportStep !== 'done' && (
                      <span className="text-[12px] text-[var(--app-text-secondary)]">
                        {CONFIG_IMPORT_STEP_LABELS[configImportStep] || configImportStep}
                      </span>
                    )}
                    {(configImportError || configExportError) && (
                      <span className="text-[11px] text-red-600">{configImportError || configExportError}</span>
                    )}
                  </div>
                </ListRow>
              </div>
            </Card>

            {/* RoverService 管理卡片 */}
            {roverserviceStatus?.supported && (
              <Card>
                <SectionHeader>
                  <div>
                    <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-quaternary)]">系统服务</h2>
                    <p className="text-[12px] text-[var(--app-text-quaternary)] mt-1">以系统权限运行，支持 TUN 模式等需要高级权限的功能。</p>
                  </div>
                </SectionHeader>
                <div className="panel-section">
                  {/* 状态显示 */}
                  <ListRow>
                    <div>
                      <div className="list-row-title">服务状态</div>
                      <div className="list-row-description">
                        {roverserviceStatus.running ? (
                          <span className="text-green-600">
                            运行中 (PID: {roverserviceStatus.pid}, 版本: {roverserviceStatus.version})
                          </span>
                        ) : roverserviceStatus.binaryInstalled ? (
                          <span className="text-yellow-600">已安装但未运行</span>
                        ) : (
                          <span className="text-[var(--app-text-tertiary)]">未安装</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {roverserviceStatus.running ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleUninstallRoverService}
                          disabled={roverserviceUninstalling}
                        >
                          {roverserviceUninstalling ? '卸载中...' : '卸载'}
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleInstallRoverService}
                          disabled={roverserviceInstalling}
                        >
                          {roverserviceInstalling ? '安装中...' : '安装'}
                        </Button>
                      )}
                    </div>
                  </ListRow>

                  {/* 重新安装按钮 - 在已安装时显示 */}
                  {roverserviceStatus.binaryInstalled && (
                    <ListRow>
                      <div>
                        <div className="list-row-title">重新安装</div>
                        <div className="list-row-description">如果服务异常，可以尝试重新安装系统服务</div>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleReinstallRoverService}
                        disabled={roverserviceInstalling}
                      >
                        {roverserviceInstalling ? '安装中...' : '重新安装'}
                      </Button>
                    </ListRow>
                  )}

                  {/* 错误信息 */}
                  {roverserviceError && (
                    <div className="px-4 py-2 text-[12px] text-red-600 bg-red-50 rounded-lg">
                      {roverserviceError}
                    </div>
                  )}

                  {/* 安装提示 */}
                  {!roverserviceStatus.binaryInstalled && (
                    <div className="px-4 py-2 text-[12px] text-[var(--app-text-secondary)] bg-[rgba(39,44,54,0.04)] rounded-lg">
                      安装需要管理员权限，请在弹出的对话框中输入密码确认。
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* 导入成功引导弹窗 */}
      <Modal
        open={configImportSuccessModal}
        onClose={handleImportSuccessConfirm}
        title="配置已导入"
        maxWidth="max-w-md"
        contentClassName="p-5"
        footer={<Button onClick={handleImportSuccessConfirm}>确定</Button>}
      >
        <p className="text-[13px] text-[var(--app-text-secondary)]">
          配置已导入成功。点击确定刷新页面以应用新配置，页面将返回首页。
        </p>
      </Modal>
    </div>
  );
}
