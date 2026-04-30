import React, { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, ArrowDown, ArrowUp } from 'lucide-react';
import { Card } from '../../components/ui/Surface';

interface TrafficData {
    up: number;
    down: number;
    time: number;
}

export function formatBytes(bytes: number, sigFigs: number = 3) {
    if (bytes === 0) return '0B';
    const k = 1024;
    const sizes = ['B', 'K', 'M', 'G'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    const magnitude = Math.floor(Math.log10(value)) + 1;
    const decimals = Math.max(0, sigFigs - magnitude);
    const formatted = value.toFixed(decimals);
    return parseFloat(formatted).toString() + sizes[i];
}

interface TrafficChartProps {
    trafficHistory: TrafficData[];
    maxTraffic: number;
    chartDownFill: string;
    chartDownStroke: string;
    chartUpFill: string;
    chartUpStroke: string;
}

const TrafficChart = React.memo<TrafficChartProps>(function TrafficChart({
    trafficHistory,
    maxTraffic,
    chartDownFill,
    chartDownStroke,
    chartUpFill,
    chartUpStroke
}) {
    const createPath = useCallback((key: 'up' | 'down') => {
        if (trafficHistory.length === 0) return '';
        const width = 800;
        const height = 200;
        const step = width / 60;

        let path = `M 0 ${height} `;
        trafficHistory.forEach((d, i) => {
            const x = i * step + (60 - trafficHistory.length) * step;
            const y = height - (d[key] / maxTraffic) * height * 0.9;
            path += `L ${x} ${y} `;
        });

        if (trafficHistory.length > 0) {
            const lastX = (60 - 1) * step;
            const lastY = height - (trafficHistory[trafficHistory.length - 1][key] / maxTraffic) * height * 0.9;
            path += `L ${800} ${lastY} L 800 ${height} Z`;
        }
        return path;
    }, [trafficHistory, maxTraffic]);

    return (
        <svg preserveAspectRatio="none" viewBox="0 0 800 200" className="w-full h-full absolute bottom-0 left-0">
            <path d="M 0 50 L 800 50 M 0 100 L 800 100 M 0 150 L 800 150" stroke="currentColor" strokeWidth="1" strokeDasharray="4 6" fill="none" className="text-[rgba(23,26,33,0.06)] dark:text-[rgba(148,163,184,0.1)]" />
            <path d={createPath('down')} fill={chartDownFill} stroke={chartDownStroke} strokeWidth="1.6" strokeLinejoin="round" />
            <path d={createPath('up')} fill={chartUpFill} stroke={chartUpStroke} strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
    );
}, (prevProps, nextProps) => {
    return prevProps.trafficHistory.length === nextProps.trafficHistory.length &&
           prevProps.maxTraffic === nextProps.maxTraffic;
});

export interface TrafficCardProps {
    currentTraffic: { up: number; down: number };
    trafficHistory: TrafficData[];
}

export function TrafficCard({ currentTraffic, trafficHistory }: TrafficCardProps) {
    const { t } = useTranslation();

    const maxTraffic = useMemo(() =>
        Math.max(
            ...trafficHistory.map(d => Math.max(d.up, d.down)),
            1024
        ), [trafficHistory]);

    // 截图风格：靛蓝紫 + 翠绿配色
    const chartDownFill = 'rgba(34, 197, 94, 0.10)';
    const chartDownStroke = '#22c55e';
    const chartUpFill = 'rgba(79, 107, 246, 0.10)';
    const chartUpStroke = '#4F6BF6';

    return (
        <Card className="traffic-card-static col-span-2 flex flex-col min-h-[220px] overflow-hidden">
            <div className="flex items-center gap-5 px-5 py-4">
                <div className="panel-title min-w-0">
                    <span className="panel-title-icon">
                        <Activity className="w-3.5 h-3.5" />
                    </span>
                    <span className="truncate">{t('dashboard.realTimeTraffic')}</span>
                </div>
                <div className="ml-auto flex min-w-0 items-center gap-5">
                                        <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-4 w-4 items-center justify-center text-[var(--app-accent)]">
                            <ArrowUp className="h-3 w-3" />
                        </span>
                        <span className="text-[10px] font-medium text-[var(--app-text-quaternary)]">{t('dashboard.upload')}</span>
                        <span className="font-mono text-[13px] font-semibold leading-none tabular-nums text-[var(--app-accent)] truncate">{formatBytes(currentTraffic.up)}/s</span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-4 w-4 items-center justify-center text-[var(--app-success)]">
                            <ArrowDown className="h-3 w-3" />
                        </span>
                        <span className="text-[10px] font-medium text-[var(--app-text-quaternary)]">{t('dashboard.download')}</span>
                        <span className="font-mono text-[13px] font-semibold leading-none tabular-nums text-[var(--app-success)] truncate">{formatBytes(currentTraffic.down)}/s</span>
                    </div>
                </div>
            </div>
            <div className="flex-1 min-h-[128px] relative bg-[linear-gradient(180deg,rgba(250,251,255,0.72),rgba(245,247,255,0.24))] dark:bg-[linear-gradient(180deg,rgba(20,26,40,0.52),rgba(15,20,32,0.18))] overflow-hidden">
                <TrafficChart
                    trafficHistory={trafficHistory}
                    maxTraffic={maxTraffic}
                    chartDownFill={chartDownFill}
                    chartDownStroke={chartDownStroke}
                    chartUpFill={chartUpFill}
                    chartUpStroke={chartUpStroke}
                />
            </div>
        </Card>
    );
}
