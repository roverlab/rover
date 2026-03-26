import React from 'react';
import { useTranslation } from 'react-i18next';
interface DnsPolicyHeaderProps {
    // DNS策略不需要额外的出站设置，保留接口以便未来扩展
}

export function DnsPolicyHeader({}: DnsPolicyHeaderProps) {
    const { t } = useTranslation();
    return (
        <div className="page-header" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
            <div>
                <h1 className="page-title">{t('dnsPolicies.title')}</h1>
                <p className="page-subtitle">{t('dnsPolicies.subtitle')}</p>
            </div>
        </div>
    );
}
