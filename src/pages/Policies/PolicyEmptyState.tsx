import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/ui/Surface';
import { Button } from '../../components/ui/Button';
import { Plus, Download, Sparkles } from 'lucide-react';

interface PolicyEmptyStateProps {
    onAdd: () => void;
    onImportTemplate: () => void;
}

export function PolicyEmptyState({ onAdd, onImportTemplate }: PolicyEmptyStateProps) {
    const { t } = useTranslation();
    
    return (
        <Card className="relative overflow-hidden p-0">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(85,96,111,0.16),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,251,0.92))]" />
            <div className="relative px-8 py-10">
                <div className="mx-auto flex max-w-[560px] flex-col items-center text-center">
                    <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] border border-[var(--app-accent-border)] bg-white/80 text-[var(--app-accent-strong)] shadow-[0_18px_40px_rgba(67,76,88,0.12)]">
                        <Sparkles className="h-7 w-7" />
                    </div>
                    <h2 className="text-[22px] font-semibold tracking-tight text-[var(--app-text)]">{t('policies.emptyState.title')}</h2>
                    <p className="mt-3 max-w-[460px] text-[13px] leading-6 text-[var(--app-text-tertiary)]">
                        {t('policies.emptyState.description')}
                    </p>
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                        <Button variant="secondary" size="sm" onClick={onImportTemplate}>
                            <Download className="w-3.5 h-3.5 mr-1" />
                            {t('policies.emptyState.importFromTemplate')}
                        </Button>
                        <Button variant="primary" size="sm" onClick={onAdd}>
                            <Plus className="w-3.5 h-3.5 mr-1" />
                            {t('policies.emptyState.createPolicy')}
                        </Button>
                    </div>
                </div>
            </div>
        </Card>
    );
}
