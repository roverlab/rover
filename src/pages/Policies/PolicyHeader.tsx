import React from 'react';
import { useTranslation } from 'react-i18next';
import { Settings } from 'lucide-react';
import { Button } from '../../components/ui/Button';

interface PolicyHeaderProps {
    onOpenSettings: () => void;
}

export function PolicyHeader({
    onOpenSettings,
}: PolicyHeaderProps) {
    const { t } = useTranslation();
    
    return (
        <div className="page-header" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
            <div>
                <h1 className="page-title">{t('policies.title')}</h1>
            </div>
            <div className="toolbar" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={onOpenSettings}
                >
                    <Settings className="w-3.5 h-3.5 mr-1" />
                    {t('ruleProviders.settings')}
                </Button>
            </div>
        </div>
    );
}
