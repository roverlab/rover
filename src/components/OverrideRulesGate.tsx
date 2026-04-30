import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/Button';
import { Sliders, GitBranch } from 'lucide-react';
import { useOverrideRules } from '../contexts/OverrideRulesContext';

interface OverrideRulesGateProps {
  pageName: 'Policies' | 'DnsPolicies' | 'RuleProviders';
  onGoToAdvancedSettings: () => void;
  children: React.ReactNode;
}

export function OverrideRulesGate({ pageName, onGoToAdvancedSettings, children }: OverrideRulesGateProps) {
  const { t } = useTranslation();
  const { overrideRules } = useOverrideRules();

  // 规则集页面不受自定义分流策略控制，始终可用
  if (pageName === 'RuleProviders') {
    return <>{children}</>;
  }

  if (overrideRules) {
    return <>{children}</>;
  }

  const pageInfo: Record<'Policies' | 'DnsPolicies', { title: string; icon: React.ElementType }> = {
    Policies: { title: t('navigation.policies'), icon: GitBranch },
    DnsPolicies: { title: t('navigation.dnsPolicies'), icon: GitBranch },
  };
  
  const { title, icon: Icon } = pageInfo[pageName];

  return (
    <div className="page-shell text-muted-foreground flex-1 min-h-0">
      <div className="page-header" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div>
          <h1 className="page-title">{title}</h1>
        </div>
      </div>
      <div className="page-content flex-1 flex items-center justify-center min-h-0">
        <div className="empty-state">
          <div className="w-16 h-16 rounded-xl bg-accent flex items-center justify-center mb-4">
            <Icon className="w-8 h-8 text-primary" />
          </div>
          <p className="text-[14px] font-medium text-foreground">
            {t('overrideRulesGate.hintPrimary')}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground max-w-sm text-center">
            {t('overrideRulesGate.hintSecondary')}
          </p>
          <Button
            variant="primary"
            className="mt-6"
            onClick={onGoToAdvancedSettings}
          >
            <Sliders className="w-4 h-4 mr-2" />
            {t('overrideRulesGate.goToAdvanced')}
          </Button>
        </div>
      </div>
    </div>
  );
}
