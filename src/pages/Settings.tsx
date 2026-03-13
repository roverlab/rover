import React, { useState, useEffect } from 'react';
import { Switch } from '../components/ui/Switch';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Field';
import { Input } from '../components/ui/Field';
import { Card, ListRow, SectionHeader } from '../components/ui/Surface';
import { Modal } from '../components/ui/Modal';
import { useApi } from '../contexts/ApiContext';
import { Settings as SettingsIcon, Sliders, Check, AlertCircle } from 'lucide-react';
import { useOverrideRules } from '../contexts/OverrideRulesContext';

interface SettingsProps {
  isActive?: boolean;
  initialTab?: 'basic' | 'advanced' | null;
  onTabConsumed?: () => void;
}


export function Settings({ isActive = true, initialTab, onTabConsumed }: SettingsProps = {}) {
  const { apiUrl, apiSecret, setApiUrl, setApiSecret } = useApi();
  const { refreshOverrideRules } = useOverrideRules();

  // App Settings
  const [lang, setLang] = useState('en');

  // Core & System Settings
  const [allowLan, setAllowLan] = useState(false);
  const [port, setPort] = useState(7890);
  const [logLevel, setLogLevel] = useState('warn');
  const [isRunning, setIsRunning] = useState(false);

  // Advanced - Rule Override
  const [overrideRules, setOverrideRules] = useState(false);

  // 订阅下载 User-Agent
  const [subscriptionUserAgent, setSubscriptionUserAgent] = useState('');

  // 启动时自动打开内核（默认 true）
  const [autoStartProxy, setAutoStartProxy] = useState(true);

  // Build info
  const [appVersion, setAppVersion] = useState('v1.0.0');
  const [singboxVersion, setSingboxVersion] = useState('sing-box 1.8.0');
  const [buildTime, setBuildTime] = useState('');

  // DNS 配置（JSON 格式，留空则使用订阅中的 DNS）
  const [dnsConfig, setDnsConfig] = useState('');
  const [dnsConfigSaved, setDnsConfigSaved] = useState(false);
  const [dnsErrorModalOpen, setDnsErrorModalOpen] = useState(false);
  const [dnsErrorModalMessage, setDnsErrorModalMessage] = useState('');
  // 编辑框显示状态：根据 dnsConfig 是否有内容判断，打开后才显示编辑框
  const [showDnsEditor, setShowDnsEditor] = useState(false);

  const loadSettings = async () => {
    try {
      const allSettings = await window.ipcRenderer.db.getAllSettings();

      const portVal = allSettings['mixed-port'] || '7890';
      const lanVal = allSettings['allow-lan'] || 'false';
      const logVal = allSettings['log-level'] || 'warn';
      const urlVal = allSettings['api-url'] || 'http://127.0.0.1:9090';
      const secretVal = allSettings['api-secret'] || '';
      const overrideRulesVal = allSettings['override-rules'] || 'false';
      const subscriptionUserAgentVal = allSettings['subscription-user-agent'] || '';
      const autoStartProxyVal = allSettings['auto-start-proxy'] ?? 'true';
      const dnsConfigVal = allSettings['dns-config'] || '';

      setPort(parseInt(portVal, 10) || 7890);
      setAllowLan(lanVal === 'true');
      setLogLevel(logVal === 'warning' ? 'warn' : logVal);
      setApiUrl(urlVal);
      setApiSecret(secretVal);
      setOverrideRules(overrideRulesVal === 'true');
      setSubscriptionUserAgent(subscriptionUserAgentVal);
      setAutoStartProxy(autoStartProxyVal === 'true');
      // 初始加载时美化 JSON
      if (dnsConfigVal.trim()) {
        try {
          const parsed = JSON.parse(dnsConfigVal);
          setDnsConfig(JSON.stringify(parsed, null, 2));
        } catch {
          setDnsConfig(dnsConfigVal);
        }
      } else {
        setDnsConfig(dnsConfigVal);
      }
      setShowDnsEditor(dnsConfigVal.trim().length > 0);
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

  // 每次进入设置页时刷新数据
  useEffect(() => {
    if (!isActive) return;
    loadSettings();
    checkStatus();
    loadBuildInfo();
    const timer = setInterval(checkStatus, 3000);
    return () => clearInterval(timer);
  }, [isActive]);

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

      // 订阅 User-Agent 和启动自动打开内核 不影响 config.json，无需重新生成
      if (key === 'subscription-user-agent' || key === 'auto-start-proxy') return;

      // Regenerate config.json（写入时若内核运行中会自动重启）
      await window.ipcRenderer.core.generateConfig();
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
    await window.ipcRenderer.core.generateConfig();
  };

  // 验证 DNS JSON 配置是否合法
  const validateDnsConfig = (value: string): string => {
    if (!value.trim()) {
      return ''; // 空值合法
    }
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== 'object' || parsed === null) {
        return 'DNS 配置必须是一个 JSON 对象';
      }
      // 基本验证：检查是否有 servers 字段（sing-box DNS 配置必须）
      if (!Array.isArray(parsed.servers)) {
        return 'DNS 配置必须包含 servers 数组';
      }
      return '';
    } catch (e) {
      return 'JSON 格式不正确';
    }
  };

  // 保存 DNS 配置
  const handleSaveDnsConfig = async () => {
    const error = validateDnsConfig(dnsConfig);
    if (error) {
      setDnsErrorModalMessage(error);
      setDnsErrorModalOpen(true);
      setDnsConfigSaved(false);
      return false;
    }
    const trimmed = dnsConfig.trim();
    await window.ipcRenderer.db.setSetting('dns-config', trimmed);
    if (trimmed.length === 0) {
      setShowDnsEditor(false);
    }
    await regenerateConfigIfNeeded();
    setDnsConfigSaved(true);
    setTimeout(() => setDnsConfigSaved(false), 3000);
    return true;
  };

  // DNS 开关：打开显示编辑框，关闭时清空并保存
  const handleDnsSwitch = async (checked: boolean) => {
    setShowDnsEditor(checked);
    if (!checked) {
      setDnsConfig('');
      setDnsConfigSaved(false);
      await window.ipcRenderer.db.setSetting('dns-config', '');
      await regenerateConfigIfNeeded();
    }
  };

  // Tab 切换
  type SettingsTab = 'basic' | 'advanced';
  const [activeTab, setActiveTab] = useState<SettingsTab>('basic');

  // 当从引导页跳转过来时，自动切换到高级设置
  useEffect(() => {
    if (initialTab === 'advanced') {
      setActiveTab('advanced');
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
                    <div className="list-row-title">主目录</div>
                    <div className="list-row-description">UserData folder</div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => window.ipcRenderer.core.openUserDataPath()}>打开</Button>
                </ListRow>

                <ListRow>
                  <div>
                    <div className="list-row-title">主题</div>
                    <div className="list-row-description">Light / Dark mode</div>
                  </div>
                  <Select
                    value="light"
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
              </div>
            </Card>
          </div>
        </div>
        )}

        {/* DNS 配置错误弹窗 */}
        <Modal
          open={dnsErrorModalOpen}
          onClose={() => setDnsErrorModalOpen(false)}
          title="DNS 配置错误"
          maxWidth="max-w-md"
          contentClassName="p-5"
          footer={
            <Button onClick={() => setDnsErrorModalOpen(false)}>确定</Button>
          }
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-[14px] text-[var(--app-text-secondary)]">{dnsErrorModalMessage}</p>
          </div>
        </Modal>

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
                    <div className="list-row-description">使用应用内置的分流规则替换订阅中的规则</div>
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
                    <div className="list-row-title">自定义 DNS 配置</div>
                    <div className="list-row-description">留空则使用本机默认DNS；填写 sing-box JSON 格式则覆盖</div>
                  </div>
                  <Switch
                    checked={showDnsEditor}
                    onCheckedChange={handleDnsSwitch}
                  />
                </ListRow>

                {showDnsEditor && (
                <ListRow className="flex-col items-stretch gap-2 py-3">
                  <div className="w-full">
                      <textarea
                          value={dnsConfig}
                          onChange={(e) => {
                            setDnsConfig(e.target.value);
                            setDnsConfigSaved(false);
                          }}
                          placeholder={`示例（sing-box 格式）：
{
  "servers": [
    { "tag": "local", "type": "udp", "server": "223.5.5.5" },
    { "tag": "remote", "type": "tls", "server": "8.8.8.8", "detour": "proxy" }
  ],
  "rules": [
    { "rule_set": "geosite:geolocation-cn", "server": "local" },
    { "query_type": ["A", "AAAA"], "server": "remote" }
  ],
  "independent_cache": true
}`}
                          className="w-full h-64 px-3 py-2 text-[13px] text-left border rounded-[10px] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)] focus:border-transparent bg-white text-[var(--app-text)] placeholder:text-[var(--app-text-quaternary)] border-[rgba(39,44,54,0.12)] font-mono"
                        />
                        <div className="flex items-center justify-between mt-2">
                          {dnsConfigSaved && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-green-600">
                              <Check className="w-3 h-3" />
                              已保存
                            </span>
                          )}
                          <div className="ml-auto flex gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                if (dnsConfig.trim()) {
                                  try {
                                    const parsed = JSON.parse(dnsConfig);
                                    setDnsConfig(JSON.stringify(parsed, null, 2));
                                  } catch {
                                    setDnsErrorModalMessage('JSON 格式不正确，无法美化');
                                    setDnsErrorModalOpen(true);
                                  }
                                }
                              }}
                            >
                              格式化
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={handleSaveDnsConfig}
                            >
                              保存
                            </Button>
                          </div>
                        </div>
                  </div>
                </ListRow>
                )}
              </div>
            </Card>
        </div>
        )}
      </div>
    </div>
  );
}
