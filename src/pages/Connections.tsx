import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Search, Activity, Plus, Check, ArrowDown, ArrowUp, Link2, Zap } from 'lucide-react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';
import { Badge, Card } from '../components/ui/Surface';
import { useApi } from '../contexts/ApiContext';
import { useNotificationState, NotificationList } from '../components/ui/Notification';
import { getWsUrl, closeConnection, closeAllConnections } from '../services/api';
import type { RuleProvider } from '../types/rule-providers';
import type { RouteLogicRule } from '../types/singbox';
import type { LeafRule } from '../components/AdvancedRuleEditor/types';
import './Connections.css';

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
    let isMounted = true;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    if (!isActive) {
      return;
    }

    const connectWs = () => {
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
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
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
  const totalDownload = connections.reduce((sum, c) => sum + c.download, 0);
  const totalUpload = connections.reduce((sum, c) => sum + c.upload, 0);

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

  /** 打开添加到规则集弹窗 */
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

  const [currentExtractType, setCurrentExtractType] = useState<RuleExtractType | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<string>('');
  const [cachedRules, setCachedRules] = useState<LeafRule[]>([]);
  const [ruleSetSearchKeyword, setRuleSetSearchKeyword] = useState('');

  /** 根据连接信息构建规则条目 */
  const buildRulesFromConnection = (conn: Connection, extractType?: RuleExtractType | null): LeafRule[] => {
    const rules: LeafRule[] = [];

    if ((!extractType || extractType === 'process') && conn.process && conn.process.trim() && conn.process !== '-') {
      rules.push({ id: crypto.randomUUID(), type: 'processNames', value: conn.process.trim() });
    }

    const isIpAddress = (str: string) => {
      if (/^\d+\.\d+\.\d+\.\d+$/.test(str)) return true;
      if (str.includes(':')) return true;
      return false;
    };

    const host = conn.host?.trim();
    const destinationIP = conn.destinationIP?.trim();

    if ((!extractType || extractType === 'domain') && host && host !== 'unknown') {
      if (!isIpAddress(host) && host !== destinationIP) {
        rules.push({ id: crypto.randomUUID(), type: 'domain', value: host });
      }
    }

    if (!extractType || extractType === 'ip') {
      if (destinationIP) {
        rules.push({ id: crypto.randomUUID(), type: 'ipCidr', value: destinationIP });
      }
      else if (host && host !== 'unknown' && isIpAddress(host)) {
        rules.push({ id: crypto.randomUUID(), type: 'ipCidr', value: host });
      }
    }

    return rules;
  };

  /** 将新规则合并到已有 RouteLogicRule 中 */
  const mergeRulesIntoLogicRule = (existingRule: RouteLogicRule | null | undefined, newRules: LeafRule[]): RouteLogicRule => {
    if (newRules.length === 0) {
      return existingRule || { type: 'logical' as const, mode: 'and' as const, rules: [] };
    }

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

    if (!existingRule || !existingRule.rules || existingRule.rules.length === 0) {
      return {
        type: 'logical',
        mode: 'or',
        rules: newHeadlessRules,
      };
    }

    const isAnyMode = existingRule.mode === 'or';

    if (isAnyMode) {
      return {
        ...existingRule,
        rules: [...existingRule.rules, ...newHeadlessRules],
      };
    } else {
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
      const newRules = selectedRule ? [selectedRule] : buildRulesFromConnection(targetConn, currentExtractType);

      if (newRules.length === 0) {
        addNotification(t('connections.noExtractableInfo'), 'warning');
        return;
      }

      if (isCreatingNew) {
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
      window.ipcRenderer.core.generateConfig().catch(console.error);
    } catch (err: any) {
      console.error('Failed to add to rule set:', err);
      addNotification(t('connections.addToRuleSetFailed', { error: err?.message || 'Unknown error' }), 'error');
    } finally {
      setSaving(false);
    }
  };

  const allExtractableRules = cachedRules;
  const selectedRule = selectedRuleId ? cachedRules.find(r => r.id === selectedRuleId) : null;
  const previewItems = currentExtractType ? buildRulesFromConnection(targetConn, currentExtractType) : allExtractableRules;

  return (
    <div className="page-shell min-w-0">
      <NotificationList notifications={notifications} onRemove={removeNotification} />

      <div className="page-header flex-wrap gap-3" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="min-w-0 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <h1 className="page-title">{t('connections.title')}</h1>
          <div className="flex items-center gap-3 mt-1.5">
            <span className={cn("conn-indicator", isConnected ? "conn-indicator-on" : "conn-indicator-off")} />
            <span className="text-[12px] text-[var(--app-text-tertiary)]">
              {isConnected ? t('connections.realtimeConnectionList') : t('connections.noActiveConnections')}
            </span>
            <Badge tone="accent" className="h-5 px-1.5 text-[10px]">{connections.length}</Badge>
            {filteredConnections.length !== connections.length && (
              <span className="text-[11px] text-[var(--app-text-quaternary)]">
                {filteredConnections.length} / {connections.length}
              </span>
            )}
            <span className="mx-0.5 h-3 w-px bg-[var(--app-stroke)]" />
            <div className="conn-stat-pill">
              <ArrowDown className="h-3 w-3 text-[var(--app-success)]" />
              <span>{formatBytes(totalDownload)}</span>
            </div>
            <div className="conn-stat-pill">
              <ArrowUp className="h-3 w-3 text-[var(--app-accent)]" />
              <span>{formatBytes(totalUpload)}</span>
            </div>
            <Button
              onClick={handleCloseAll}
              variant="ghost"
              size="sm"
              title={t('connections.closeAllTitle')}
              className="h-6 px-2 text-[10px] gap-1"
            >
              <X className="w-3 h-3" />
              {t('connections.closeAll')}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="relative w-full min-w-0 max-w-52 sm:w-auto">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--app-text-quaternary)] shrink-0" />
            <Input
              type="text"
              placeholder={t('connections.searchPlaceholder')}
              className="pl-8 text-[12px] w-full min-w-0 pr-7 h-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-[var(--app-hover)] text-[var(--app-text-quaternary)] hover:text-[var(--app-text-secondary)] transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="page-content min-w-0 flex flex-col min-h-0 overflow-hidden !px-2 sm:!px-4 conn-container">
        {/* 连接列表 */}
        <div className="flex-1 min-h-0 overflow-y-auto conn-list-scroll">
          {/* 列表头 */}
          <div className="conn-list-header">
            <div className="conn-list-col-host">{t('connections.address')}</div>
            <div className="conn-list-col-process">{t('connections.process')}</div>
            <div className="conn-list-col-chain">{t('connections.chain')}</div>
            <div className="conn-list-col-rule">{t('connections.rule')}</div>
            <div className="conn-list-col-traffic">{t('connections.traffic')}</div>
            <div className="conn-list-col-time">{t('connections.time')}</div>
            <div className="conn-list-col-actions">{t('connections.action')}</div>
          </div>

          {filteredConnections.length === 0 ? (
            <div className="conn-empty-state">
              <Activity className="w-5 h-5 mb-1.5 text-[var(--app-text-quaternary)]" />
              <p className="text-[12px] text-[var(--app-text-quaternary)]">{t('connections.noActiveConnections')}</p>
            </div>
          ) : (
            <div className="conn-list-body">
              {filteredConnections.map((conn) => (
                <div key={conn.id} className="conn-list-row group">
                  {/* 地址 */}
                  <div className="conn-list-col-host">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="conn-host truncate">{conn.host}:{conn.port}</span>
                      <span className={cn(
                        "conn-network-badge",
                        conn.network === 'tcp' ? "conn-network-tcp" : "conn-network-udp"
                      )}>
                        {conn.network}
                      </span>
                    </div>
                    {conn.destinationIP && (
                      <span className="conn-subtle truncate">{conn.destinationIP}</span>
                    )}
                  </div>

                  {/* 进程 */}
                  <div className="conn-list-col-process">
                    <span className="conn-process truncate" title={conn.process}>{conn.process || '-'}</span>
                    <span className="conn-subtle truncate">{conn.type || ''}</span>
                  </div>

                  {/* 链路 */}
                  <div className="conn-list-col-chain">
                    <div className="flex items-center gap-1 min-w-0 flex-wrap">
                      {conn.chains.length > 0 ? conn.chains.map((chain) => (
                        <span key={chain} className="conn-chain-chip" title={chain}>{chain}</span>
                      )) : <span className="conn-subtle">-</span>}
                    </div>
                  </div>

                  {/* 规则 */}
                  <div className="conn-list-col-rule">
                    <span className="conn-rule truncate" title={conn.rule}>{conn.rule || '-'}</span>
                  </div>

                  {/* 流量 */}
                  <div className="conn-list-col-traffic">
                    <span className="conn-traffic-down">
                      <ArrowDown className="h-2.5 w-2.5" />
                      {formatBytes(conn.download)}
                    </span>
                    <span className="conn-traffic-up">
                      <ArrowUp className="h-2.5 w-2.5" />
                      {formatBytes(conn.upload)}
                    </span>
                  </div>

                  {/* 时间 */}
                  <div className="conn-list-col-time">
                    <span className="conn-time">{conn.time}</span>
                  </div>

                  {/* 操作 */}
                  <div className="conn-list-col-actions">
                    <div className="conn-actions-group">
                      <Button
                        onClick={() => handleAddToRuleSet(conn)}
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-[var(--app-text-quaternary)] hover:text-[var(--app-accent-strong)]"
                        title={t('connections.addToRuleSetTitle')}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                      <Button
                        onClick={() => handleCloseConnection(conn.id)}
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-[var(--app-text-quaternary)] hover:text-[var(--app-danger)]"
                        title={t('connections.closeAll')}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
                className="relative z-10 w-full max-w-md flex flex-col bg-[var(--app-panel)] border border-[var(--app-stroke)] rounded-[20px] shadow-[var(--shadow-window)] overflow-hidden"
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
                                    : "border-[var(--app-stroke)] bg-[var(--app-panel)] text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)]"
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
                              : "border-[var(--app-stroke)] bg-[var(--app-panel)] text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)]"
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
                              : "border-[var(--app-stroke)] bg-[var(--app-panel)] text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)]"
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
                                      : "border-[var(--app-stroke)] bg-[var(--app-panel)] text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)]"
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
