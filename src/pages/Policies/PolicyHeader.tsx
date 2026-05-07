import React from 'react';
import { useTranslation } from 'react-i18next';

export function PolicyHeader() {
    const { t } = useTranslation();
    
    return (
        <div className="page-header !pb-2" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
            <div>
                <h1 className="page-title">{t('policies.title')}</h1>
            </div>
        </div>
    );
}
