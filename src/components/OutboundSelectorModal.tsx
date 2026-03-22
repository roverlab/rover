import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui/Button';
import { X, Search, RefreshCw, Clock, Check } from 'lucide-react';
import { cn } from './Sidebar';
import { useApi } from '../contexts/ApiContext';
import { fetchProxies } from '../services/api';

export type OutboundItem = { tag: string; type: string; all?: string[]; delay?: number };

type OutboundSelectorModalPropsBase = {
    open: boolean;
    availableOutbounds: OutboundItem[];
    onClose: () => void;
    /** 弹窗标题，默认「选择订阅出站节点」 */
    title?: string;
};

export type OutboundSelectorModalProps =
    | (OutboundSelectorModalPropsBase & {
          multiple?: false;
          preferredOutbound: string | null;
          onConfirm: (tag: string | null) => void;
      })
    | (OutboundSelectorModalPropsBase & {
          multiple: true;
          preferredOutbounds: string[];
          onConfirm: (tags: string[]) => void;
      });

/**
 * 获取延迟对应的颜色类名
 */
function getDelayClass(delay?: number): string {
    if (delay === undefined) return 'text-[var(--app-text-quaternary)]';
    if (delay === 0) return 'text-red-500';
    if (delay < 200) return 'text-green-500';
    if (delay < 500) return 'text-yellow-600';
    return 'text-red-500';
}

/**
 * 格式化延迟显示文本
 */
function formatDelay(delay?: number): string {
    if (delay === undefined) return '';
    if (delay === 0) return 'Timeout';
    return `${delay}ms`;
}

/**
 * 出站节点选择弹窗 - 支持单选与多选
 */
export function OutboundSelectorModal(props: OutboundSelectorModalProps) {
    const {
        open,
        availableOutbounds = [],
        onClose,
        title = '选择订阅出站节点',
    } = props;
    const multiple = props.multiple === true;
    const preferredOutbound = !multiple ? props.preferredOutbound : null;
    const preferredOutbounds = multiple ? props.preferredOutbounds : [];
    const multiInitKey = multiple ? preferredOutbounds.join('\0') : '';

    // 1. 使用本地状态，避免每次点击都触发父组件重绘导致弹窗卸载
    const [localSelected, setLocalSelected] = useState<string | null>(null);
    const [localSelectedMulti, setLocalSelectedMulti] = useState<string[]>([]);
    // 搜索关键词
    const [searchQuery, setSearchQuery] = useState('');
    // 延迟数据
    const [delayMap, setDelayMap] = useState<Record<string, number>>({});
    // 是否正在加载延迟
    const [loadingDelays, setLoadingDelays] = useState(false);
    // 是否有任何节点有延迟数据（用于判断其他节点是否为超时）
    const [hasAnyDelay, setHasAnyDelay] = useState(false);
    // 是否过滤超时节点
    const [hideTimeout, setHideTimeout] = useState(false);

    const { apiUrl, apiSecret } = useApi();

    // 加载延迟数据（从 API 获取历史记录）
    const loadDelays = useCallback(async () => {
        if (!apiUrl) return;

        setLoadingDelays(true);
        try {
            const apiData = await fetchProxies(apiUrl, apiSecret);
            const proxies = apiData?.proxies || {};
            const newDelays: Record<string, number> = {};

            // 遍历所有节点，获取 history 延迟
            for (const [proxyName, proxyData] of Object.entries(proxies)) {
                const pData = proxyData as { history?: Array<{ time: string; delay: number }> };
                if (Array.isArray(pData.history) && pData.history.length > 0) {
                    const latestHistory = pData.history[pData.history.length - 1];
                    if (latestHistory && typeof latestHistory.delay === 'number') {
                        newDelays[proxyName] = latestHistory.delay;
                    }
                }
            }

            setDelayMap(newDelays);
            // 判断是否有任何节点有延迟数据
            setHasAnyDelay(Object.keys(newDelays).length > 0);
        } catch {
            // 核心未启动或 API 不可达：不展示延迟即可，不向外抛错
            setDelayMap({});
            setHasAnyDelay(false);
        } finally {
            setLoadingDelays(false);
        }
    }, [apiUrl, apiSecret]);

    // 2. 每次打开弹窗时，从 props 同步初始选中的值，并清空搜索，加载延迟
    useEffect(() => {
        if (!open) return;
        if (multiple) {
            setLocalSelectedMulti([...preferredOutbounds]);
        } else {
            setLocalSelected(preferredOutbound);
        }
        setSearchQuery('');
        loadDelays();
    }, [open, multiple, preferredOutbound, multiInitKey, loadDelays]);

    // 判断节点是否超时（延迟为0或没有延迟数据但有其他节点有延迟）
    const isNodeTimeout = useCallback((tag: string): boolean => {
        const delay = delayMap[tag];
        if (delay === 0) return true;
        if (delay === undefined && hasAnyDelay) return true;
        return false;
    }, [delayMap, hasAnyDelay]);

    // 过滤后的出站节点列表
    const filteredOutbounds = availableOutbounds.filter(ob => {
        // 搜索过滤
        const matchSearch = !searchQuery.trim() ||
            ob.tag.toLowerCase().includes(searchQuery.toLowerCase()) ||
            ob.type.toLowerCase().includes(searchQuery.toLowerCase());
        // 超时过滤
        const matchTimeout = !hideTimeout || !isNodeTimeout(ob.tag);
        return matchSearch && matchTimeout;
    });

    const selectOutbound = (tag: string) => {
        if (multiple) {
            setLocalSelectedMulti(prev =>
                prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
            );
        } else {
            setLocalSelected(prev => (prev === tag ? null : tag));
        }
    };

    const toggleSelectAllFiltered = () => {
        const names = filteredOutbounds.map(o => o.tag);
        if (names.length === 0) return;
        const allOn = names.every(n => localSelectedMulti.includes(n));
        if (allOn) {
            setLocalSelectedMulti(prev => prev.filter(t => !names.includes(t)));
        } else {
            setLocalSelectedMulti(prev => {
                const next = new Set(prev);
                names.forEach(n => next.add(n));
                return [...next];
            });
        }
    };

    const handleConfirm = () => {
        if (multiple) {
            (props as Extract<OutboundSelectorModalProps, { multiple: true }>).onConfirm(localSelectedMulti);
        } else {
            (props as Extract<OutboundSelectorModalProps, { multiple?: false }>).onConfirm(localSelected);
        }
        onClose();
    };

    if (!open) return null;

    return createPortal(
        <AnimatePresence>
            <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
                {/* 背景遮罩 */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-0 bg-black/40 backdrop-blur-sm"
                    onClick={onClose}
                />

                {/* 弹窗主体 */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="relative z-10 w-full max-w-2xl flex flex-col bg-white border border-[var(--app-stroke)] rounded-[20px] shadow-[var(--shadow-window)] overflow-hidden"
                    style={{ 
                        minHeight: '320px', // 设定最小高度，解决节点少时的塌陷感
                        maxHeight: '85vh',  // 限制弹窗整体最大高度
                        WebkitAppRegion: 'no-drag' 
                    } as React.CSSProperties}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header - 固定高度 */}
                    <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[var(--app-divider)] bg-[var(--app-sidebar)]/50">
                        <h2 className="text-[15px] font-semibold text-[var(--app-text)]">{title}</h2>
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Content - 滚动区域 */}
                    <div className="flex-1 p-6 overflow-y-auto min-h-0 bg-white">
                        {/* 搜索框和过滤按钮 */}
                        <div className="mb-4 flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--app-text-quaternary)]" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="搜索节点名称或类型..."
                                    className="w-full pl-9 pr-3 py-2 text-[13px] rounded-[10px] border border-[rgba(39,44,54,0.12)] bg-white text-[var(--app-text)] placeholder:text-[var(--app-text-quaternary)] focus:outline-none focus:border-[var(--app-accent-border)] hover:border-[rgba(39,44,54,0.18)] transition-colors"
                                />
                            </div>
                            {/* 过滤超时按钮 */}
                            <button
                                type="button"
                                onClick={() => setHideTimeout(prev => !prev)}
                                className={cn(
                                    "shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] text-[12px] border transition-all",
                                    hideTimeout
                                        ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
                                        : "border-[rgba(39,44,54,0.12)] bg-white text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)]"
                                )}
                                title="过滤超时节点"
                            >
                                <Clock className="w-3.5 h-3.5" />
                                隐藏超时
                            </button>
                        </div>
                        {multiple && filteredOutbounds.length > 0 && (
                            <div className="mb-3 flex justify-end">
                                <button
                                    type="button"
                                    onClick={toggleSelectAllFiltered}
                                    className="text-[12px] text-[var(--app-accent-strong)] hover:underline px-1"
                                >
                                    {filteredOutbounds.every(o => localSelectedMulti.includes(o.tag))
                                        ? '取消全选当前筛选'
                                        : '全选当前筛选'}
                                </button>
                            </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                            {filteredOutbounds.map(ob => {
                                const active = multiple
                                    ? localSelectedMulti.includes(ob.tag)
                                    : localSelected === ob.tag;
                                const delay = delayMap[ob.tag];
                                const hasDelay = delay !== undefined;
                                // 如果有任何一个节点有延迟，其他没有延迟数据的显示为超时
                                const showAsTimeout = !loadingDelays && hasAnyDelay && !hasDelay;
                                
                                return (
                                    <div
                                        key={ob.tag}
                                        onClick={() => selectOutbound(ob.tag)}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] cursor-pointer transition-all border shrink-0",
                                            active
                                                ? "border-[var(--app-accent)] bg-[var(--app-accent-soft-card)]"
                                                : "border-[var(--app-stroke)] bg-white hover:bg-[var(--app-hover)]"
                                        )}
                                    >
                                        {multiple ? (
                                            <div
                                                className={cn(
                                                    'w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors',
                                                    active
                                                        ? 'bg-[var(--app-accent)] border-[var(--app-accent)]'
                                                        : 'border-[var(--app-stroke-strong)]'
                                                )}
                                            >
                                                {active && <Check className="w-3 h-3 text-white" />}
                                            </div>
                                        ) : (
                                            <div
                                                className={cn(
                                                    'w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                                                    active
                                                        ? 'border-[var(--app-accent)]'
                                                        : 'border-[var(--app-stroke-strong)]'
                                                )}
                                            >
                                                {active && <div className="w-2 h-2 rounded-full bg-[var(--app-accent)]" />}
                                            </div>
                                        )}
                                        <span className="text-[13px] text-[var(--app-text)]">{ob.tag}</span>
                                        <span className="text-[10px] text-[var(--app-text-quaternary)]">({ob.type})</span>
                                        {/* 延迟显示 - 加载中显示转圈，有延迟显示数值，无延迟但有其他节点有延迟时显示超时 */}
                                        {loadingDelays ? (
                                            <RefreshCw className="w-3 h-3 animate-spin text-[var(--app-accent)]" />
                                        ) : hasDelay ? (
                                            <span className={cn("text-[10px] font-mono ml-1", getDelayClass(delay))}>
                                                {formatDelay(delay)}
                                            </span>
                                        ) : showAsTimeout ? (
                                            <span className="text-[10px] font-mono ml-1 text-red-500">Timeout</span>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                        {filteredOutbounds.length === 0 && (
                            <div className="text-center py-8 text-[var(--app-text-tertiary)] text-[13px]">
                                {searchQuery ? '未找到匹配的节点' : '暂无可用节点'}
                            </div>
                        )}
                    </div>

                    {/* Footer - 固定高度 */}
                    <div className="flex shrink-0 items-center justify-between px-6 py-4 border-t border-[var(--app-divider)] bg-[var(--app-sidebar)]/30">
                        <div className="flex items-center gap-3 min-w-0">
                            <span className="text-[12px] text-[var(--app-text-quaternary)] truncate">
                                {multiple
                                    ? `已选择 ${localSelectedMulti.length} 个节点`
                                    : localSelected
                                      ? `已选择: ${localSelected}`
                                      : '未选择节点'}
                            </span>
                            {multiple ? (
                                localSelectedMulti.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setLocalSelectedMulti([])}
                                        className="text-[11px] text-[var(--app-text-tertiary)] hover:text-red-500 transition-colors shrink-0"
                                    >
                                        清除选择
                                    </button>
                                )
                            ) : (
                                localSelected && (
                                    <button
                                        type="button"
                                        onClick={() => setLocalSelected(null)}
                                        className="text-[11px] text-[var(--app-text-tertiary)] hover:text-red-500 transition-colors shrink-0"
                                    >
                                        清除选择
                                    </button>
                                )
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={onClose}>取消</Button>
                            <Button variant="primary" onClick={handleConfirm}>确定</Button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>,
        document.body
    );
}
