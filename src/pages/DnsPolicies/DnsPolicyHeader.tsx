import React from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Server } from 'lucide-react';
import { Button } from '../../components/ui/Button';

interface DnsPolicyHeaderProps {
    onOpenSettings?: () => void;
    onOpenDnsServers?: () => void;
}

export function DnsPolicyHeader({ onOpenSettings, onOpenDnsServers }: DnsPolicyHeaderProps) {
    const { t } = useTranslation();
    return (
        <div className="page-header !pb-2" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
            <div>
                <h1 className="page-title">{t('dnsPolicies.title')}</h1>
            </div>
            <div className="toolbar" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                {onOpenDnsServers && (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={onOpenDnsServers}
                        className="h-8 rounded-md border-[var(--app-stroke)] bg-[var(--app-panel)]/75 px-3 text-[12px] shadow-none"
                    >
                        <Server className="w-3.5 h-3.5 mr-1" />
                        {t('dnsServersTab.title')}
                    </Button>
                )}
                {onOpenSettings && (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={onOpenSettings}
                        className="h-8 rounded-md border-[var(--app-stroke)] bg-[var(--app-panel)]/75 px-3 text-[12px] shadow-none"
                    >
                        <Settings className="w-3.5 h-3.5 mr-1" />
                        {t('ruleProviders.settings')}
                    </Button>
                )}
            </div>
        </div>
    );
}
