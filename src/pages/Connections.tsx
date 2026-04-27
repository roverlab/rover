import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Search, Activity, Plus, Check } from 'lucide-react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../components/Sidebar';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';
import { Badge, Card } from '../components/ui/Surface';
import { useApi } from '../contexts/ApiContext';
import { useNotificationState, NotificationList } from '../components/ui/Notification';
import { getWsUrl, closeConnection, closeAllConnections } from '../services/api';
import type { RuleProvider } from '../types/rule-providers';
import type { RouteLogicRule } from '../types/singbox';
import type { LeafRule } from '../components/AdvancedRuleEditor/types';

interface Connection {
  id: string;
  host: string;
  destinationIP?: string;
  port: string;
  network: string;
  type: string;
  chains: string[];
  rule: string;
  upload: number;
  download: number;
  time: string;
  process?: string;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatTime = (start: string) => {
  const diff = Math.floor((Date.now() - new Date(start).getTime()) / 1000);
  if (diff < 0) return '00:00:00';
  const h = Math.floor(diff / 3600).toString().padStart(2, '0');
  const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(diff % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
};

interface ConnectionsProps {
  isActive?: boolean;
}

export function Connections({ isActive = true }: ConnectionsProps) {
  const { t } = useTranslation();
  const { apiUrl, apiSecret } = useApi();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [search, setSearch] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const { notifications, addNotification, removeNotification } = useNotificationState();

  // 添加到规则集相关状态
  const [showAddToRuleSetModal, setShowAddToRuleSetModal] = useState(false);
  const [targetConn, setTargetConn] = useState<Connection | null>(null);
  const [ruleProviders, setRuleProviders] = useState<RuleProvider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [newRuleSetName, setNewRuleSetName] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // 用于追踪当前 effect 是否仍然有效
    let isMounted = true;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    // 页面不激活时不建立连接
    if (!isActive) {
      return;
    }

    const connectWs = () => {
      // 检查组件是否仍然挂载且页面激活
      if (!isMounted) {
        return;
      }
      
      try {
        const wsUrl = getWsUrl(apiUrl, '/connections', apiSecret);
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (isMounted) {
            setIsConnected(true);
          }
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);
            if (data.connections) {
              const mapped = data.connections.map((c: any) => {
                // 提取进程名
                const processPath = c.metadata.processPath || '';
                const processName = processPath ? processPath.split(/[\\/]/).pop() : '';
                
                const hasHost = c.metadata.host && c.metadata.host.trim() !== '';
                const hasIP = c.metadata.destinationIP && c.metadata.destinationIP.trim() !== '';
                
                return {
                  id: c.id,
                  host: hasHost ? c.metadata.host : (hasIP ? c.metadata.destinationIP : 'unknown'),
                  destinationIP: hasHost && hasIP ? c.metadata.destinationIP : undefined,
                  port: c.metadata.destinationPort || '',
                  network: c.metadata.network,
                  type: c.metadata.type,
                  chains: c.chains || [],
                  rule: c.rule || '',
                  upload: c.upload,
                  download: c.download,
                  time: formatTime(c.start),
                  process: processName
                };
              });
              setConnections(mapped);
            }
          } catch (e) {
            console.error('Failed to parse connections', e);
          }
        };

        ws.onerror = () => {
          if (isMounted) {
            setIsConnected(false);
          }
        };

        ws.onclose = () => {
          if (isMounted) {
            setIsConnected(false);
            // 只有组件仍然挂载时才尝试重连
            reconnectTimeout = setTimeout(connectWs, 5000);
          }
        };

        wsRef.current = ws;
      } catch (err: any) {
        if (isMounted) {
          setIsConnected(false);
        }
      }
    };

    connectWs();

    return () => {
      isMounted = false;
      // 清除待执行的重连定时器
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      // 关闭 WebSocket 连接
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [apiUrl, apiSecret, isActive]);

  const handleCloseConnection = async (id: string) => {
    try {
      await closeConnection(apiUrl, apiSecret, id);
      setConnections(connections.filter(c => c.id !== id));
    } catch (err) {
      console.error('Failed to close connection', err);
    }
  };

  const handleCloseAll = async () => {
    try {
      await closeAllConnections(apiUrl, apiSecret);
      setConnections([]);
    } catch (err) {
      console.error('Failed to close all connections', err);
    }
  };

  const filteredConnections = connections.filter(c => 
    c.host.toLowerCase().includes(search.toLowerCase()) || 
    (c.process && c.process.toLowerCase().includes(search.toLowerCase()))
  );

  // ========== 添加到规则集功能 ==========

  /** 加载本地规则集列表 */
  const loadLocalRuleProviders = useCallback(async () => {
    try {
      const allProviders: RuleProvider[] = await window.ipcRenderer.db.getRuleProviders();
      const localProviders = allProviders.filter(p => p.type === 'local');
      setRuleProviders(localProviders);
    } catch (err) {
      console.error('Failed to load rule providers:', err);
    }
  }, []);

  /** 规则提取类型 */
  type RuleExtractType = 'process' | 'domain' | 'ip';

  /** 打开添加到规则集弹窗（不指定类型则显示全部可选项供选择） */
  const handleAddToRuleSet = (conn: Connection) => {
    const rules = buildRulesFromConnection(conn, null);
    setTargetConn(conn);
    setCachedRules(rules);
    setCurrentExtractType(null);
    setSelectedRuleId('');
    setSelectedProviderId('');
    setRuleSetSearchKeyword('');
    setNewRuleSetName('');
    setIsCreatingNew(false);
    setShowAddToRuleSetModal(true);
    loadLocalRuleProviders();
  };

  /** 当前要提取的规则类型（null 表示全部，即显示选项列表） */
  const [currentExtractType, setCurrentExtractType] = useState<RuleExtractType | null>(null);
  /** 弹窗中选中的规则 ID（单选） */
  const [selectedRuleId, setSelectedRuleId] = useState<string>('');
  /** 缓存的可提取规则列表（避免每次 render 重新生成 UUID 导致选中失效） */
  const [cachedRules, setCachedRules] = useState<LeafRule[]>([]);
  /** 规则集搜索关键词 */
  const [ruleSetSearchKeyword, setRuleSetSearchKeyword] = useState('');

  /** 根据连接信息构建规则条目
   * @param extractType 只提取指定类型，不传则提取所有可用规则
   */
  const buildRulesFromConnection = (conn: Connection, extractType?: RuleExtractType | null): LeafRule[] => {
    const rules: LeafRule[] = [];

    // 进程名 -> processNames
    if ((!extractType || extractType === 'process') && conn.process && conn.process.trim() && conn.process !== '-') {
      rules.push({ id: crypto.randomUUID(), type: 'processNames', value: conn.process.trim() });
    }

    // 判断是否为 IP 地址（支持 IPv4 和 IPv6）
    const isIpAddress = (str: string) => {
      // IPv4 格式
      if (/^\d+\.\d+\.\d+\.\d+$/.test(str)) return true;
      // IPv6 格式（包含冒号）
      if (str.includes(':')) return true;
      return false;
    };

    const host = conn.host?.trim();
    const destinationIP = conn.destinationIP?.trim();

    // 域名 -> domain (host 不是 IP 时)
    if ((!extractType || extractType === 'domain') && host && host !== 'unknown') {
      if (!isIpAddress(host) && host !== destinationIP) {
        rules.push({ id: crypto.randomUUID(), type: 'domain', value: host });
      }
    }

    // IP -> ipCidr
    if (!extractType || extractType === 'ip') {
      // 优先使用 destinationIP（域名解析后的 IP）
      if (destinationIP) {
        rules.push({ id: crypto.randomUUID(), type: 'ipCidr', value: destinationIP });
      }
      // 如果 host 本身就是 IP（直接访问 IP，没有域名），则使用 host
      else if (host && host !== 'unknown' && isIpAddress(host)) {
        rules.push({ id: crypto.randomUUID(), type: 'ipCidr', value: host });
      }
    }

    return rules;
  };

  /** 将新规则合并到已有 RouteLogicRule 中
   *  - 如果原规则集是 any（mode: 'or'），直接追加新规则
   *  - 如果原规则集不是 any（如 and），则在外层包一个 any（mode: 'or'），将原规则和新规则作为同级项
   */
  const mergeRulesIntoLogicRule = (existingRule: RouteLogicRule | null | undefined, newRules: LeafRule[]): RouteLogicRule => {
    if (newRules.length === 0) {
      return existingRule || { type: 'logical' as const, mode: 'and' as const, rules: [] };
    }

    // 构建 sing-box headless rule 格式
    const newHeadlessRules: Record<string, unknown>[] = [];
    for (const r of newRules) {
      const vals = r.value.split(',').map(s => s.trim()).filter(Boolean);
      if (vals.length === 0) continue;

      const keyMap: Record<string, string> = {
        processNames: 'process_name',
        domain: 'domain',
        ipCidr: 'ip_cidr',
      };
      const key = keyMap[r.type];
      if (!key) continue;

      newHeadlessRules.push({ [key]: vals });
    }

    // 无现有规则：直接返回新的 logical 规则（新建默认 any/or 模式）
    if (!existingRule || !existingRule.rules || existingRule.rules.length === 0) {
      return {
        type: 'logical',
        mode: 'or',
        rules: newHeadlessRules,
      };
    }

    const isAnyMode = existingRule.mode === 'or';

    if (isAnyMode) {
      // 原规则集是 any 模式：直接追加
      return {
        ...existingRule,
        rules: [...existingRule.rules, ...newHeadlessRules],
      };
    } else {
      // 原规则集不是 any 模式：在外层包一个 any（or），原规则和新规则作为同级子规则
      return {
        type: 'logical',
        mode: 'or',
        rules: [existingRule, ...newHeadlessRules],
      };
    }
  };

  /** 确认添加到规则集 */
  const handleConfirmAddToRuleSet = async () => {
    if (!targetConn) return;

    try {
      setSaving(true);
      // 使用选中的单条规则，如果没有选中则使用全部
      const newRules = selectedRule ? [selectedRule] : buildRulesFromConnection(targetConn, currentExtractType);

      if (newRules.length === 0) {
        addNotification(t('connections.noExtractableInfo'), 'warning');
        return;
      }

      if (isCreatingNew) {
        // 新建规则集
        if (!newRuleSetName.trim()) {
          addNotification(t('connections.ruleSetNameRequired'), 'error');
          return;
        }

        const logicRule = mergeRulesIntoLogicRule(null, newRules);
        await window.ipcRenderer.core.saveRuleProvider({
          id: undefined,
          name: newRuleSetName.trim(),
          url: '',
          type: 'local',
          enabled: false,
          logical_rule: logicRule,
        });

        addNotification(t('connections.ruleSetCreated'), 'success');
      } else {
        // 添加到已有规则集
        if (!selectedProviderId) {
          addNotification(t('connections.selectRuleSetRequired'), 'error');
          return;
        }

        const targetProvider = ruleProviders.find(p => p.id === selectedProviderId);
        if (!targetProvider) return;

        const logicRule = mergeRulesIntoLogicRule(targetProvider.logical_rule, newRules);
        await window.ipcRenderer.core.saveRuleProvider({
          id: selectedProviderId,
          name: targetProvider.name,
          url: targetProvider.url,
          type: 'local',
          enabled: true,
          logical_rule: logicRule,
        });

        addNotification(t('connections.addedToRuleSet', { name: targetProvider.name }), 'success');
      }

      setShowAddToRuleSetModal(false);
      setTargetConn(null);
      // 触发配置生成
      window.ipcRenderer.core.generateConfig().catch(console.error);
    } catch (err: any) {
      console.error('Failed to add to rule set:', err);
      addNotification(t('connections.addToRuleSetFailed', { error: err?.message || 'Unknown error' }), 'error');
    } finally {
      setSaving(false);
    }
  };

  // 使用缓存的规则列表（打开弹窗时一次性生成，ID 不会因 render 变化）
  const allExtractableRules = cachedRules;
  // 当前选中的规则（用于确认提交）
  const selectedRule = selectedRuleId ? cachedRules.find(r => r.id === selectedRuleId) : null;
  // 预览项：如果有选中则只显示选中的，否则显示全部作为选择列表
  const previewItems = currentExtractType ? buildRulesFromConnection(targetConn, currentExtractType) : allExtractableRules;

  return (
    <div className="page-shell min-w-0">
      <NotificationList notifications={notifications} onRemove={removeNotification} />

      <div className="page-header flex-wrap gap-3" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="min-w-0 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <h1 className="page-title">{t('connections.title')}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge tone="accent">{connections.length} {t('connections.active')}</Badge>
          </div>
        </div>

        <div className="flex items-center gap-2.5 min-w-0 flex-1 sm:flex-initial" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="relative w-full min-w-0 max-w-52">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--app-text-quaternary)] shrink-0" />
            <Input
              type="text"
              placeholder={t('connections.searchPlaceholder')}
              className="pl-9 text-[12px] w-full min-w-0 pr-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-[var(--app-hover)] text-[var(--app-text-quaternary)] hover:text-[var(--app-text-secondary)] transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="page-content min-w-0 px-4 sm:px-6 flex flex-col min-h-0 overflow-hidden">
      <Card className="flex-1 overflow-hidden min-w-0 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--app-divider)] shrink-0">
          <div className="text-[13px] font-medium text-[var(--app-text-secondary)]">{t('connections.realtimeConnectionList')}</div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleCloseAll}
              variant="secondary"
              size="sm"
              title={t('connections.closeAllTitle')}
              className="h-7 px-2.5 text-[11px] gap-1"
            >
              <X className="w-3 h-3" />
              {t('connections.closeAll')}
            </Button>
          </div>
        </div>
        <div className="table-scroll-x flex-1 min-w-0 min-h-0">
          <table className="data-table text-[12px] min-w-[700px]">
          <thead className="sticky top-0 z-10 text-[12px] font-semibold text-[var(--app-text-secondary)] !bg-[rgba(255,255,255,0.9)]">
            <tr>
              <th className="px-3 py-2.5 text-center w-16"></th>
              <th className="px-5 py-2.5">{t('connections.process')}</th>
              <th className="px-5 py-2.5">{t('connections.address')}</th>
              <th className="px-5 py-2.5">{t('connections.network')}</th>
              <th className="px-5 py-2.5">{t('connections.chain')}</th>
              <th className="px-5 py-2.5">{t('connections.rule')}</th>
              <th className="px-5 py-2.5 text-right min-w-[140px]">{t('connections.traffic')}</th>
              <th className="px-5 py-2.5 text-right">{t('connections.time')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-divider)]">
            {filteredConnections.map((conn) => (
              <tr key={conn.id} className="group">
                <td className="px-3 py-2.5 text-center">
                  <div className="flex items-center justify-center">
                    <Button
                      onClick={() => handleAddToRuleSet(conn)}
                      variant="ghost"
                      size="icon"
                      className="text-[var(--app-text-quaternary)] hover:text-[var(--accent-strong)]"
                      title={t('connections.addToRuleSetTitle')}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      onClick={() => handleCloseConnection(conn.id)}
                      variant="ghost"
                      size="icon"
                      className="text-[var(--app-text-quaternary)] hover:text-[var(--app-danger)]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </td>
                <td className="px-5 py-2.5">
                  <span className="text-[11px] text-[var(--app-text-secondary)] truncate max-w-[120px] block" title={conn.process}>
                    {conn.process || '-'}
                  </span>
                </td>
                <td className="px-5 py-2.5 font-medium text-[var(--app-text)] truncate max-w-[200px]" title={`${conn.host}:${conn.port}${conn.destinationIP ? ' (' + conn.destinationIP + ')' : ''}`}>
                  <div className="flex flex-col">
                    <span>{conn.host}:{conn.port}</span>
                    {conn.destinationIP && (
                      <span className="text-[10px] text-[var(--app-text-quaternary)] font-mono">({conn.destinationIP})</span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-2.5">
                  <div className="flex flex-col gap-1 items-center">
                    <span className={cn(
                      "badge",
                      conn.network === 'tcp' ? "bg-[rgba(100,116,139,0.12)] text-[var(--app-info)]" : "bg-[var(--app-warning-soft)] text-[var(--app-warning)]"
                    )}>
                      {conn.network}
                    </span>
                    <span className="text-[10px] text-[var(--app-text-quaternary)] font-mono truncate max-w-[80px]" title={conn.type}>
                      {conn.type}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-2.5">
                  <div className="flex items-center space-x-1 text-[11px] text-[var(--app-text-tertiary)]">
                    {conn.chains.map((chain, i) => (
                      <span key={i} className="flex items-center">
                        {i > 0 && <span className="mx-0.5 text-[var(--app-text-quaternary)]">›</span>}
                        <span className="truncate max-w-[80px]" title={chain}>{chain}</span>
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-2.5 text-[var(--app-text-quaternary)] text-[11px] truncate max-w-[200px]" title={conn.rule}>{conn.rule}</td>
                <td className="px-5 py-2.5 text-right min-w-[140px] whitespace-nowrap">
                  <div className="flex flex-col text-[11px] font-mono">
                    <span className="text-[var(--app-success)]">↓ {formatBytes(conn.download)}</span>
                    <span className="text-[var(--app-accent)]">↑ {formatBytes(conn.upload)}</span>
                  </div>
                </td>
                <td className="px-5 py-2.5 text-right text-[var(--app-text-quaternary)] font-mono text-[11px]">{conn.time}</td>
              </tr>
            ))}
            {connections.length === 0 && !isConnected && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-[var(--app-text-quaternary)]">
                  <Activity className="w-6 h-6 mx-auto mb-2 text-[var(--app-text-quaternary)]" />
                  <p className="text-[13px]">{t('connections.noActiveConnections')}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>
      </div>

      {/* 添加到规则集弹窗 */}
      {createPortal(
        <AnimatePresence>
          {showAddToRuleSetModal && targetConn && (
            <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-0 bg-black/40 backdrop-blur-sm"
                onClick={() => setShowAddToRuleSetModal(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="relative z-10 w-full max-w-md flex flex-col bg-white border border-[var(--app-stroke)] rounded-[20px] shadow-[var(--shadow-window)] overflow-hidden"
                style={{
                  maxHeight: '85vh',
                  WebkitAppRegion: 'no-drag'
                } as React.CSSProperties}
                onClick={e => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[var(--app-divider)]">
                  <h2 className="text-[15px] font-semibold text-[var(--app-text)]">{t('connections.addToRuleSetTitle')}</h2>
                  <button
                    type="button"
                    onClick={() => setShowAddToRuleSetModal(false)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  <div className="p-5 space-y-4">
                    {/* 选择要添加的规则 */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-medium text-[var(--app-text-secondary)]">{t('connections.selectRuleToAdd')}</label>
                      {allExtractableRules.length > 0 ? (
                        <div className="space-y-1">
                          {allExtractableRules.map(item => {
                            const isSelected = selectedRuleId === item.id;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => setSelectedRuleId(item.id)}
                                className={cn(
                                  "w-full text-left flex items-center gap-2 px-3 py-2 rounded-[8px] text-[12px] transition-all border",
                                  isSelected
                                    ? "border-[var(--app-accent)] bg-[var(--app-accent-soft-card)] text-[var(--app-accent-strong)]"
                                    : "border-[var(--app-stroke)] bg-white text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)]"
                                )}
                              >
                                <span className={cn(
                                  "shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-all",
                                  isSelected
                                    ? "border-[var(--app-accent)] bg-[var(--app-accent)]"
                                    : "border-[var(--app-stroke)]"
                                )}>
                                  {isSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                                </span>
                                <Badge tone={isSelected ? "accent" : "neutral"} className="text-[10px] px-1.5 py-0 shrink-0">
                                  {item.type === 'processNames' ? t('connections.process') : item.type === 'domain' ? t('connections.domain') : t('connections.ip')}
                                </Badge>
                                <span className={cn("font-mono truncate", isSelected && "font-medium")}>{item.value}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[12px] text-[var(--app-text-quaternary)] py-2">{t('connections.noExtractableInfo')}</p>
                      )}
                    </div>

                    {/* 选择目标规则集 */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-medium text-[var(--app-text-secondary)]">{t('connections.targetRuleSet')}</label>

                      {/* 切换：选择已有 / 新建 */}
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setIsCreatingNew(false)}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition-all border",
                            !isCreatingNew
                              ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)]"
                              : "border-[var(--app-stroke)] bg-white text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)]"
                          )}
                        >
                          {t('connections.selectExisting')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsCreatingNew(true)}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition-all border",
                            isCreatingNew
                              ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)]"
                              : "border-[var(--app-stroke)] bg-white text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)]"
                          )}
                        >
                          {t('connections.createNew')}
                        </button>
                      </div>

                      {!isCreatingNew ? (
                        <div className="space-y-1.5">
                          {ruleProviders.length > 0 && (
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--app-text-quaternary)]" />
                              <Input
                                value={ruleSetSearchKeyword}
                                onChange={(e) => setRuleSetSearchKeyword(e.target.value)}
                                placeholder={t('connections.searchRuleSetPlaceholder')}
                                className="pl-8 h-8 text-[12px]"
                              />
                            </div>
                          )}
                          {ruleProviders.length === 0 ? (
                            <p className="text-[12px] text-[var(--app-text-quaternary)] py-2">{t('connections.noLocalRuleSets')}</p>
                          ) : (
                            <div className="max-h-[180px] overflow-y-auto space-y-1">
                              {ruleProviders
                                .filter(p => !ruleSetSearchKeyword.trim() || p.name.toLowerCase().includes(ruleSetSearchKeyword.trim().toLowerCase()))
                                .map(p => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => setSelectedProviderId(p.id)}
                                  className={cn(
                                    "w-full text-left px-3 py-2 rounded-[8px] text-[12px] transition-colors border",
                                    selectedProviderId === p.id
                                      ? "border-[var(--app-accent)] bg-[var(--app-accent-soft-card)] text-[var(--app-accent-strong)] font-medium"
                                      : "border-[var(--app-stroke)] bg-white text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)]"
                                  )}
                                >
                                  {p.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <Input
                          value={newRuleSetName}
                          onChange={(e) => setNewRuleSetName(e.target.value)}
                          placeholder={t('connections.newRuleSetNamePlaceholder')}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex shrink-0 items-center justify-end gap-2 px-6 py-4 border-t border-[var(--app-divider)]">
                  <Button variant="ghost" size="sm" onClick={() => setShowAddToRuleSetModal(false)} disabled={saving} className="h-8 text-[12px]">
                    {t('common.cancel')}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleConfirmAddToRuleSet}
                    disabled={
                      saving ||
                      !selectedRuleId ||
                      (isCreatingNew ? !newRuleSetName.trim() : !selectedProviderId)
                    }
                    className="h-8 text-[12px]"
                  >
                    {saving ? (
                      <>
                        <Activity className="w-3.5 h-3.5 mr-1 animate-spin" />
                        {t('connections.saving')}
                      </>
                    ) : t('common.confirm')}
                  </Button>
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
