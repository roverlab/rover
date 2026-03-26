/**
 * 出站节点选择器组件
 * 封装了选择器触发器和 OutboundSelectorModal 弹窗
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, X } from 'lucide-react';
import { cn } from './Sidebar';
import { OutboundSelectorModal } from './OutboundSelectorModal';
import { POLICY_FINAL_OPTION_DEFS } from '../types/policy';

export type OutboundItem = { tag: string; type: string; all?: string[]; delay?: number };

type OutboundSelectorPropsBase = {
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
    /** 弹窗标题（默认「选择订阅出站节点」） */
    modalTitle?: string;
    /**
     * 若提供则使用该列表作为可选节点，不从当前选中订阅配置加载。
     * 用于分组编辑等需与指定 profile 节点列表一致的场景。
     */
    availableOutboundsOverride?: OutboundItem[];
};

export type OutboundSelectorProps =
    | (OutboundSelectorPropsBase & {
          multiple?: false;
          /** 当前选中的出站节点 tag，null 或空字符串表示未选择 */
          value: string | null;
          /** 选择变化时的回调 */
          onChange: (tag: string | null) => void;
      })
    | (OutboundSelectorPropsBase & {
          multiple: true;
          /** 当前选中的节点 tag 列表 */
          value: string[];
          /** 选择变化时的回调 */
          onChange: (tags: string[]) => void;
      });

// 静态定义内置标签，避免每次渲染创建新数组
const BUILTIN_TAGS = POLICY_FINAL_OPTION_DEFS.map(o => o.value);

/**
 * 出站节点选择器（单选或多选）
 */
export function OutboundSelector(props: OutboundSelectorProps) {
    const { t } = useTranslation();
    const {
        placeholder: placeholderProp,
        label,
        hint,
        filterDirectBlock = true,
        disabled = false,
        className,
        modalTitle: modalTitleProp,
        availableOutboundsOverride,
    } = props;
    const placeholder = placeholderProp ?? t('outboundSelector.placeholder');
    const modalTitle = modalTitleProp ?? t('outboundSelector.modalTitle');
    const multiple = props.multiple === true;

    const [showModal, setShowModal] = useState(false);
    const [outbounds, setOutbounds] = useState<OutboundItem[]>([]);
    const [loading, setLoading] = useState(false);

    const loadedRef = useRef(false);
    const overrideRef = useRef(availableOutboundsOverride);
    overrideRef.current = availableOutboundsOverride;

    const loadOutbounds = useCallback(async () => {
        const override = overrideRef.current;
        if (override !== undefined) {
            setOutbounds(override);
            return;
        }
        setLoading(true);
        try {
            const result = await window.ipcRenderer.core.getSelectedProfile();
            if (!result?.config) {
                setOutbounds([]);
                return;
            }

            const { config } = result;
            const configOutbounds = config.outbounds || [];
            const list: OutboundItem[] = [];

            for (const outbound of configOutbounds) {
                if (BUILTIN_TAGS.includes(outbound.tag)) continue;
                if (filterDirectBlock && ['direct', 'block'].includes(outbound.type?.toLowerCase())) continue;
                list.push({
                    tag: outbound.tag,
                    type: outbound.type,
                });
            }

            setOutbounds(list);
        } catch {
            setOutbounds([]);
        } finally {
            setLoading(false);
        }
    }, [filterDirectBlock]);

    useEffect(() => {
        if (availableOutboundsOverride !== undefined) {
            setOutbounds(availableOutboundsOverride);
            return;
        }
        if (!loadedRef.current) {
            loadedRef.current = true;
            loadOutbounds();
        }
    }, [availableOutboundsOverride, loadOutbounds]);

    const handleOpenModal = () => {
        if (!disabled) {
            loadOutbounds();
            setShowModal(true);
        }
    };

    const handleConfirmSingle = (tag: string | null) => {
        if (!multiple) {
            (props as Extract<OutboundSelectorProps, { multiple?: false }>).onChange(tag);
        }
    };

    const handleConfirmMulti = (tags: string[]) => {
        if (multiple) {
            (props as Extract<OutboundSelectorProps, { multiple: true }>).onChange(tags);
        }
    };

    const removeTag = (tag: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (multiple) {
            (props as Extract<OutboundSelectorProps, { multiple: true }>).onChange(
                props.value.filter(t => t !== tag)
            );
        }
    };

    const valueSingle = !multiple ? props.value : null;
    const valueMulti = multiple ? props.value : [];

    const summaryChips = useMemo(() => {
        if (multiple) {
            const tags = valueMulti;
            const shown = tags.slice(0, 3);
            const rest = tags.length - shown.length;
            return { shown, rest };
        }
        return { shown: valueSingle ? [valueSingle] : [], rest: 0 };
    }, [multiple, valueMulti, valueSingle]);

    return (
        <div className={cn('space-y-1.5', className)}>
            {label && (
                <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">
                    {label}
                </label>
            )}
            <div
                className={cn(
                    'relative flex items-center min-h-[36px] px-3 py-2 pr-8 rounded-[10px] border bg-white transition-all',
                    disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                    'border-[rgba(39,44,54,0.12)]'
                )}
                onClick={handleOpenModal}
            >
                {multiple ? (
                    valueMulti.length === 0 ? (
                        <span className="text-[13px] text-[var(--app-text-quaternary)]">{placeholder}</span>
                    ) : (
                        <div className="flex items-center gap-2 flex-wrap py-0.5">
                            {summaryChips.shown.map(tag => (
                                <span
                                    key={tag}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] bg-[var(--app-accent-soft)] text-[var(--app-text)] border border-[var(--app-accent-border)]"
                                >
                                    <span className="truncate max-w-[140px]">{tag}</span>
                                    {!disabled && (
                                        <button
                                            type="button"
                                            onClick={e => removeTag(tag, e)}
                                            className="text-[var(--app-text-tertiary)] hover:text-[var(--app-danger)]"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    )}
                                </span>
                            ))}
                            {summaryChips.rest > 0 && (
                                <span className="text-[11px] text-[var(--app-text-tertiary)]">
                                    {t('outboundSelector.moreCount', { count: summaryChips.rest })}
                                </span>
                            )}
                        </div>
                    )
                ) : !valueSingle ? (
                    <span className="text-[13px] text-[var(--app-text-quaternary)]">{placeholder}</span>
                ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] bg-[var(--app-accent-soft)] text-[var(--app-text)] border border-[var(--app-accent-border)]">
                        <span className="truncate max-w-[200px]">{valueSingle}</span>
                    </span>
                )}
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--app-text-quaternary)] pointer-events-none" />
            </div>
            {hint && <p className="text-[11px] text-[var(--app-text-quaternary)]">{hint}</p>}
            {loading && availableOutboundsOverride === undefined && (
                <p className="text-[11px] text-[var(--app-text-quaternary)]">
                    {t('outboundSelector.loadingNodes')}
                </p>
            )}

            {multiple ? (
                <OutboundSelectorModal
                    open={showModal}
                    multiple
                    title={modalTitle}
                    availableOutbounds={outbounds}
                    preferredOutbounds={valueMulti}
                    onConfirm={handleConfirmMulti}
                    onClose={() => setShowModal(false)}
                />
            ) : (
                <OutboundSelectorModal
                    open={showModal}
                    title={modalTitle}
                    availableOutbounds={outbounds}
                    preferredOutbound={valueSingle}
                    onConfirm={handleConfirmSingle}
                    onClose={() => setShowModal(false)}
                />
            )}
        </div>
    );
}
