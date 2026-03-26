import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../components/ui/Surface';
import { Button } from '../components/ui/Button';
import { Plus, Layers, FileDown } from 'lucide-react';

interface RuleProvidersEmptyStateProps {
    onAdd: () => void;
}

export function RuleProvidersEmptyState({ onAdd }: RuleProvidersEmptyStateProps) {
    const { t } = useTranslation();
    
    return (
        <Card className="relative overflow-hidden p-0">
            {/* 背景渐变 */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(85,96,111,0.16),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,251,0.92))]" />
            
            <div className="relative px-8 py-10">
                <div className="mx-auto flex max-w-[560px] flex-col items-center text-center">
                    {/* 图标 */}
                    <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] border border-[var(--app-accent-border)] bg-white/80 text-[var(--app-accent-strong)] shadow-[0_18px_40px_rgba(67,76,88,0.12)]">
                        <Layers className="h-7 w-7" />
                    </div>
                    
                    {/* 标题 */}
                    <h2 className="text-[22px] font-semibold tracking-tight text-[var(--app-text)]">{t('emptyStates.noRuleProviders')}</h2>
                    
                    {/* 描述 */}
                    <p className="mt-3 max-w-[460px] text-[13px] leading-6 text-[var(--app-text-tertiary)]">
                        {t('emptyStates.noRuleProvidersDesc')}
                    </p>
                    
                    {/* 操作按钮 */}
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                        <Button variant="primary" size="sm" onClick={onAdd}>
                            <Plus className="w-3.5 h-3.5 mr-1" />
                            {t('emptyStates.addRuleProvider')}
                        </Button>
                    </div>
                    
                    {/* 快速入门提示 */}
                    <div className="mt-8 pt-6 border-t border-[var(--app-divider)] w-full max-w-[420px]">
                        <div className="flex items-start gap-3 text-left">
                            <div className="shrink-0 mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)]">
                                <FileDown className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-[12px] font-medium text-[var(--app-text-secondary)]">{t('emptyStates.quickStart')}</p>
                                <p className="mt-1 text-[11px] text-[var(--app-text-quaternary)] leading-relaxed">
                                    {t('emptyStates.quickStartDesc')}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
}
