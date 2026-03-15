import React from 'react';
import { Button } from './ui/Button';
import { Sliders, GitBranch, List } from 'lucide-react';
import { useOverrideRules } from '../contexts/OverrideRulesContext';

interface OverrideRulesGateProps {
  pageName: 'Policies' | 'DnsPolicies' | 'RuleProviders';
  onGoToAdvancedSettings: () => void;
  children: React.ReactNode;
}

const PAGE_INFO: Record<'Policies' | 'DnsPolicies' | 'RuleProviders', { title: string; icon: React.ElementType }> = {
  Policies: { title: '策略', icon: GitBranch },
  DnsPolicies: { title: 'DNS策略', icon: GitBranch },
  RuleProviders: { title: '规则集', icon: List },
};

export function OverrideRulesGate({ pageName, onGoToAdvancedSettings, children }: OverrideRulesGateProps) {
  const { overrideRules } = useOverrideRules();

  // 规则集页面不受自定义分流策略控制，始终可用
  if (pageName === 'RuleProviders') {
    return <>{children}</>;
  }

  if (overrideRules) {
    return <>{children}</>;
  }

  const { title, icon: Icon } = PAGE_INFO[pageName];

  return (
    <div className="page-shell text-[var(--app-text-secondary)] flex-1 min-h-0">
      <div className="page-header" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">需要开启自定义分流策略后使用</p>
        </div>
      </div>
      <div className="page-content flex-1 flex items-center justify-center min-h-0">
        <div className="empty-state">
          <div className="w-16 h-16 rounded-2xl bg-[var(--app-accent-soft)] flex items-center justify-center mb-4">
            <Icon className="w-8 h-8 text-[var(--app-accent-strong)]" />
          </div>
          <p className="text-[14px] font-medium text-[var(--app-text)]">
            请先在高级设置中开启「自定义分流策略」
          </p>
          <p className="mt-1 text-[12px] text-[var(--app-text-tertiary)] max-w-sm text-center">
            策略和规则集功能仅在启用自定义分流时可用，用于配置分流规则和规则集源
          </p>
          <Button
            variant="primary"
            size="md"
            className="mt-6"
            onClick={onGoToAdvancedSettings}
          >
            <Sliders className="w-4 h-4 mr-2" />
            前往高级设置
          </Button>
        </div>
      </div>
    </div>
  );
}
