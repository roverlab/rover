import React, { useState, useEffect } from 'react';
import type { Policy, SingboxRouteRuleWithOutbound } from '../../types/policy';
import { cnJsonRuleToPolicy, configRouteRuleToPolicy } from '../../types/policy';
import type { RuleProvider } from '../../types/rule-providers';
import { normalizeRuleSetBuildInToAclIds } from './utils';
import { PolicyImportModal } from './PolicyImportModal';
import { useConfirm } from '../../components/ui/Notification';

export interface PolicyImportModalContainerProps {
    open: boolean;
    importSource: 'template' | 'config';
    policiesCount: number;
    onClose: () => void;
    onImportComplete: (updatedPolicies?: Policy[], policyFinalOutbound?: string) => void;
    addNotification: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export function PolicyImportModalContainer({
    open,
    importSource,
    policiesCount,
    onClose,
    onImportComplete,
    addNotification,
}: PolicyImportModalContainerProps) {
    const [templates, setTemplates] = useState<Array<{ name: string; description: string; path: string }>>([]);
    const [configRules, setConfigRules] = useState<SingboxRouteRuleWithOutbound[]>([]);
    const [selectedRules, setSelectedRules] = useState<Set<number>>(new Set());
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ success: number; skipped: number } | null>(null);
    const [ruleProviders, setRuleProviders] = useState<RuleProvider[]>([]);
    const { confirm, ConfirmDialog } = useConfirm();

    useEffect(() => {
        if (open) {
            setSelectedRules(new Set());
            setImportResult(null);
            if (importSource === 'template') {
                window.ipcRenderer.core.getTemplates().then((list) => {
                    setTemplates(list || []);
                });
            } else {
                window.ipcRenderer.core.getCurrentConfigRules().then((rules) => {
                    setConfigRules(rules || []);
                });
            }
            window.ipcRenderer.db.getRuleProviders().then((data: RuleProvider[]) => {
                setRuleProviders(data || []);
            });
        }
    }, [open, importSource]);

    const handleSelectTemplate = async (templatePath: string) => {
        // 检查当前策略数量，如果需要清空的策略，显示确认对话框
        if (policiesCount > 0) {
            const confirmed = await confirm({
                title: '确认导入预设',
                message: `导入预设会清空当前的 ${policiesCount} 条策略，确定要继续吗？`,
                confirmText: '确定导入',
                cancelText: '取消',
                variant: 'warning'
            });

            if (!confirmed) {
                return;
            }
        }

        try {
            setImporting(true);
            setImportResult(null);

            // 使用新的统一导入API
            const result = await window.ipcRenderer.core.importTemplateComplete(templatePath);

            if (!result.success) {
                addNotification(result.message, 'error');
                setImporting(false);
                return;
            }

            addNotification(result.message, 'success');

            // 处理 TUN 模式需要管理员权限的情况（只有开启 TUN 时才提示）
            if (result.tunNeedsAdmin && result.tunValue === true) {
                addNotification('TUN模式没有设置成功，请以管理员权限重启应用后在仪表盘打开', 'error');
            }

            // 获取更新后的策略列表和兜底出站设置
            const updatedPolicies = await window.ipcRenderer.db.getPolicies() as Policy[];
            onImportComplete(updatedPolicies || [], result.finalOutbound);
            onClose();
        } catch (err: unknown) {
            console.log(err);
            addNotification(`导入失败: ${(err as Error).message}`, 'error');
        } finally {
            setImporting(false);
        }
    };

    const toggleRuleSelection = (index: number) => {
        setSelectedRules(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedRules.size === configRules.length) {
            setSelectedRules(new Set());
        } else {
            setSelectedRules(new Set(configRules.map((_, i) => i)));
        }
    };

    const handleImport = async () => {
        if (selectedRules.size === 0) return;
        
        // 检查当前策略数量，如果需要清空的策略，显示确认对话框
        if (policiesCount > 0) {
            const confirmed = await confirm({
                title: '确认导入配置',
                message: `导入配置会清空当前的 ${policiesCount} 条策略，确定要继续吗？`,
                confirmText: '确定导入',
                cancelText: '取消',
                variant: 'warning'
            });
            
            if (!confirmed) {
                return;
            }
        }
        
        try {
            setImporting(true);
            setImportResult(null);
            const [providers, presetRulesets] = await Promise.all([
                window.ipcRenderer.db.getRuleProviders() as Promise<RuleProvider[]>,
                window.ipcRenderer.core.getPresetRulesets(),
            ]);
            const presetIds = new Set((presetRulesets || []).map((p: { id: string }) => p.id));
            const selectedIndices = Array.from(selectedRules).sort((a: number, b: number) => a - b);
            const policiesToImport: Array<Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>> = [];
            selectedIndices.forEach((index, order) => {
                const rule = configRules[index];
                const policy = configRouteRuleToPolicy(rule, order);
                const normalized = normalizeRuleSetBuildInToAclIds(policy.ruleSetBuildIn || [], providers || [], presetIds);
                policiesToImport.push({ ...policy, ruleSetBuildIn: normalized.normalized });
            });
            if (policiesToImport.length === 0) {
                addNotification('未找到有效的策略配置', 'error');
                return;
            }
            const aclRefsInPolicies = new Set<string>();
            for (const p of policiesToImport) {
                for (const v of p.ruleSetBuildIn || []) {
                    if (typeof v === 'string' && v.startsWith('acl:')) aclRefsInPolicies.add(v.substring(4));
                }
            }
            const toAddOrOverwriteFromPreset = [...aclRefsInPolicies].filter(id => presetIds.has(id));
            if (toAddOrOverwriteFromPreset.length > 0) {
                const result = await window.ipcRenderer.core.addRuleProvidersFromPreset(toAddOrOverwriteFromPreset);
                const total = (result?.added ?? 0) + (result?.updated ?? 0);
                if (total > 0) {
                    const parts: string[] = [];
                    if ((result?.added ?? 0) > 0) parts.push(`添加 ${result.added} 个`);
                    if ((result?.updated ?? 0) > 0) parts.push(`重写 ${result.updated} 个`);
                    addNotification(`预设规则集：${parts.join('，')}`, 'info');
                }
            }
            const addedCount = await window.ipcRenderer.db.addPoliciesBatch(policiesToImport, true);
            
            // 策略导入成功后，触发 config.json 写入
            if (addedCount > 0) {
                await window.ipcRenderer.core.generateConfig();
            }
            
            addNotification(`成功导入 ${addedCount} 条策略`);
            onImportComplete();
            onClose();
        } catch (err: unknown) {
            console.error(err);
            addNotification(`导入失败: ${(err as Error).message}`, 'error');
        } finally {
            setImporting(false);
        }
    };

    return (
        <>
            <PolicyImportModal
                open={open}
                importSource={importSource}
                templates={templates}
                configRules={configRules}
                selectedRules={selectedRules}
                importing={importing}
                importResult={importResult}
                ruleProviders={ruleProviders}
                onSelectTemplate={handleSelectTemplate}
                onToggleRuleSelection={toggleRuleSelection}
                onToggleSelectAll={toggleSelectAll}
                onImport={handleImport}
                onClose={() => { onClose(); setImportResult(null); }}
            />
            <ConfirmDialog />
        </>
    );
}
