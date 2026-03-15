import React from 'react';
import { cn } from '../../components/Sidebar';

interface DnsPolicyHeaderProps {
    // DNS策略不需要额外的出站设置，保留接口以便未来扩展
}

export function DnsPolicyHeader({}: DnsPolicyHeaderProps) {
    return (
        <div className="page-header" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
            <div>
                <h1 className="page-title">DNS策略</h1>
                <p className="page-subtitle">配置DNS分流规则，为不同域名指定不同的DNS服务器。</p>
            </div>
        </div>
    );
}
