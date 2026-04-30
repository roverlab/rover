import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { Card } from '../../components/ui/Surface';
import WorldMap from '../../components/WorldMap';
import * as FlagIcons from 'country-flag-icons/react/3x2';

export interface NetworkInfo {
    ip: string;
    country: string;
    countryCode: string;
}

export interface NetworkDetectionCardProps {
    networkInfo: NetworkInfo | null;
    showNetworkTip: boolean;
    onShowNetworkTip: (show: boolean) => void;
}

export function NetworkDetectionCard({ networkInfo, onShowNetworkTip }: NetworkDetectionCardProps) {
    const { t } = useTranslation();

    return (
        <Card className="p-4 flex flex-col">
            <div className="panel-title mb-3">
                <span className="panel-title-icon">
                    <Globe className="w-3.5 h-3.5" />
                </span>
                <span>{t('dashboard.networkDetection')}</span>
                <button
                    onClick={() => onShowNetworkTip(true)}
                    className="p-0.5 hover:bg-[var(--app-hover)] rounded-full transition-colors ml-1"
                    title={t('tooltips.tip')}
                >
                    <svg className="w-4 h-4 text-[var(--app-text-quaternary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4" />
                        <path d="M12 8h.01" />
                    </svg>
                </button>
            </div>

            {/* IP + 国家信息 */}
            {networkInfo && (
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-6 rounded overflow-hidden shadow-sm flex-shrink-0" title={networkInfo.country}>
                        {(() => {
                            const code = networkInfo.countryCode;
                            const FlagComponent = (FlagIcons as Record<string, React.ComponentType<{ className?: string }>>)[code];
                            return FlagComponent ? <FlagComponent className="w-full h-full object-cover" /> : <div className="w-full h-full bg-[var(--app-accent)] text-white flex items-center justify-center text-[10px] font-bold">{code}</div>;
                        })()}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[14px] text-[var(--app-text-secondary)] font-mono">{networkInfo.ip}</span>
                        <span className="text-[11px] text-[var(--app-text-quaternary)]">{networkInfo.country}</span>
                    </div>
                </div>
            )}

            {/* 世界地图区域 - 使用 SVG 矢量渲染 */}
            <div className="relative w-full -mx-4 overflow-hidden">
                <WorldMap marker={networkInfo ? { countryCode: networkInfo.countryCode, country: networkInfo.country } : null} />
            </div>
        </Card>
    );
}
