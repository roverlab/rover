/**
 * 出站节点选择器组件
 * 封装了选择器触发器和 PolicyPreferredOutboundModal 弹窗
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './Sidebar';
import { OutboundSelectorModal } from './OutboundSelectorModal';
import { POLICY_FINAL_OPTIONS } from '../pages/Policies/utils';

export type OutboundItem = { tag: string; type: string; all?: string[]; delay?: number };

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
    /** 是否过滤掉 direct 和 block 类型的出站 */
    filterDirectBlock?: boolean;
    /** 是否禁用 */
    disabled?: boolean;
    /** 额外的容器 className */
    className?: string;
}

// 静态定义内置标签，避免每次渲染创建新数组
const BUILTIN_TAGS = POLICY_FINAL_OPTIONS.map(o => o.value);

/**
 * 出站节点选择器
 *
 * 示例用法：
 * ```tsx
 * <OutboundSelector
 *   value={form.detour}
 *   onChange={(tag) => setForm(f => ({ ...f, detour: tag || '' }))}
 *   label="出站"
 *   hint="可选，选择用于连接此 DNS 服务器的出站节点"
 * />
 * ```
 */
export function OutboundSelector({
    value,
    onChange,
    placeholder = '请选择节点',
    label,
    hint,
    filterDirectBlock = true,
    disabled = false,
    className,
}: OutboundSelectorProps) {
    const [showModal, setShowModal] = useState(false);
    const [outbounds, setOutbounds] = useState<OutboundItem[]>([]);
    const [loading, setLoading] = useState(false);

    // 使用 ref 跟踪是否已加载
    const loadedRef = useRef(false);

    // 加载出站列表（不获取延迟，延迟在点击测试时才获取）
    const loadOutbounds = useCallback(async () => {
        setLoading(true);
        try {
            // 从配置文件读取代理节点
            const result = await window.ipcRenderer.core.getSelectedProfile();
            if (!result) {
                setOutbounds([]);
                return;
            }

            const { config } = result;
            const configOutbounds = config.outbounds || [];

            // 过滤并构建出站列表
            const list: OutboundItem[] = [];

            // 遍历所有出站，获取非分组类型的实际节点
            for (const outbound of configOutbounds) {
                // 跳过内置标签
                if (BUILTIN_TAGS.includes(outbound.tag)) continue;

                // 过滤掉 direct 和 block 类型
                if (filterDirectBlock && ['direct', 'block'].includes(outbound.type?.toLowerCase())) continue;

                list.push({
                    tag: outbound.tag,
                    type: outbound.type
                });
            }

            setOutbounds(list);
        } catch (err) {
            console.error('Failed to load outbounds:', err);
            setOutbounds([]);
        } finally {
            setLoading(false);
        }
    }, [filterDirectBlock]);

    // 仅在组件首次挂载时加载一次
    useEffect(() => {
        if (!loadedRef.current) {
            loadedRef.current = true;
            loadOutbounds();
        }
    }, [loadOutbounds]);

    // 打开弹窗时刷新数据
    const handleOpenModal = () => {
        if (!disabled) {
            loadOutbounds();
            setShowModal(true);
        }
    };

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
                onClick={handleOpenModal}
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
