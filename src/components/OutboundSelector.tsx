/**
 * 出站节点选择器组件
 * 封装了选择器触发器和 PolicyPreferredOutboundModal 弹窗
 */
import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './Sidebar';
import { OutboundSelectorModal } from './OutboundSelectorModal';

export type OutboundItem = { tag: string; type: string; all?: string[] };

export interface OutboundSelectorProps {
    /** 当前选中的出站节点 tag，null 或空字符串表示未选择 */
    value: string | null;
    /** 选择变化时的回调 */
    onChange: (tag: string | null) => void;
    /** 占位符文本 */
    placeholder?: string;
    /** 标签文本 */
    label?: string;
    /** 提示文本 */
    hint?: string;
    /** 预传入的出站列表，如果不传则自动从后端获取 */
    outbounds?: OutboundItem[];
    /** 是否过滤掉 direct 和 block 类型的出站 */
    filterDirectBlock?: boolean;
    /** 是否禁用 */
    disabled?: boolean;
    /** 额外的容器 className */
    className?: string;
}

/**
 * 出站节点选择器
 * 
 * 示例用法：
 * ```tsx
 * // 自动加载出站列表（默认过滤 direct 和 block）
 * <OutboundSelector
 *   value={form.detour}
 *   onChange={(tag) => setForm(f => ({ ...f, detour: tag || '' }))}
 *   label="出站"
 *   hint="可选，选择用于连接此 DNS 服务器的出站节点"
 * />
 * 
 * // 使用预传入的出站列表
 * <OutboundSelector
 *   value={form.preferredOutbound}
 *   onChange={(tag) => onFormChange({ preferredOutbound: tag })}
 *   outbounds={availableOutbounds}
 *   label="订阅出站节点"
 *   placeholder="请选择节点"
 *   filterDirectBlock={false}
 * />
 * ```
 */
export function OutboundSelector({
    value,
    onChange,
    placeholder = '请选择节点',
    label,
    hint,
    outbounds: propOutbounds,
    filterDirectBlock = true,
    disabled = false,
    className,
}: OutboundSelectorProps) {
    const [showModal, setShowModal] = useState(false);
    const [autoOutbounds, setAutoOutbounds] = useState<OutboundItem[]>([]);

    // 如果没有传入 outbounds，则自动加载
    useEffect(() => {
        if (propOutbounds !== undefined) return;
        
        window.ipcRenderer.core.getAvailableOutbounds().then((data) => {
            let list = (data as OutboundItem[]) || [];
            if (filterDirectBlock) {
                list = list.filter(
                    (o) => !['direct', 'block'].includes(o.type?.toLowerCase())
                );
            }
            setAutoOutbounds(list);
        });
    }, [propOutbounds, filterDirectBlock]);

    // 优先使用传入的 outbounds，否则使用自动加载的
    const outbounds = propOutbounds !== undefined ? propOutbounds : autoOutbounds;

    const handleConfirm = (tag: string | null) => {
        onChange(tag);
        setShowModal(false);
    };

    return (
        <div className={cn("space-y-1.5", className)}>
            {label && (
                <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">
                    {label}
                </label>
            )}
            <div
                className={cn(
                    "relative flex items-center min-h-[36px] px-3 py-2 pr-8 rounded-[10px] border bg-white transition-all",
                    disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                    "border-[rgba(39,44,54,0.12)]"
                )}
                onClick={() => !disabled && setShowModal(true)}
            >
                {!value ? (
                    <span className="text-[13px] text-[var(--app-text-quaternary)]">{placeholder}</span>
                ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] bg-[var(--app-accent-soft)] text-[var(--app-text)] border border-[var(--app-accent-border)]">
                        <span className="truncate max-w-[200px]">{value}</span>
                    </span>
                )}
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--app-text-quaternary)] pointer-events-none" />
            </div>
            {hint && (
                <p className="text-[11px] text-[var(--app-text-quaternary)]">{hint}</p>
            )}
            
            {/* 出站选择弹窗 */}
            <OutboundSelectorModal
                open={showModal}
                availableOutbounds={outbounds}
                preferredOutbound={value}
                onConfirm={handleConfirm}
                onClose={() => setShowModal(false)}
            />
        </div>
    );
}
