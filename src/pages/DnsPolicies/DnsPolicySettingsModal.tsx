import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Select } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';

interface DnsPolicySettingsModalProps {
    open: boolean;
    dnsServers: Array<{ id: string; name?: string }>;
    onClose: () => void;
    onSaved?: () => void;
}

/**
 * DNS策略设置弹窗
 * 管理三个DNS服务器选择项：
 * 1. 规则未匹配默认DNS服务器
 * 2. 直连出站DNS服务器
 * 3. 代理节点DNS服务器
 */
export function DnsPolicySettingsModal({
    open,
    dnsServers,
    onClose,
    onSaved,
}: DnsPolicySettingsModalProps) {
    const { t } = useTranslation();
    const [unmatchedServer, setUnmatchedServer] = useState('');
    const [resolveServer, setResolveServer] = useState('');
    const [proxyServer, setProxyServer] = useState('');
    const [saving, setSaving] = useState(false);

    // 加载已保存的设置
    useEffect(() => {
        if (!open) return;
        const loadSettings = async () => {
            try {
                const allSettings = await window.ipcRenderer.db.getAllSettings();
                setUnmatchedServer(allSettings['dns-unmatched-server'] || '');
                setResolveServer(allSettings['dns-resolve-server'] || '');
                setProxyServer(allSettings['dns-proxy-server'] || '');
            } catch (err) {
                console.error('Failed to load DNS policy settings:', err);
            }
        };
        loadSettings();
    }, [open]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await window.ipcRenderer.db.setSetting('dns-unmatched-server', unmatchedServer);
            await window.ipcRenderer.db.setSetting('dns-resolve-server', resolveServer);
            await window.ipcRenderer.db.setSetting('dns-proxy-server', proxyServer);
            // 异步重新生成配置，不阻塞UI
            window.ipcRenderer.core.generateConfig().catch(console.error);
            onSaved?.();
            onClose();
        } catch (err) {
            console.error('Failed to save DNS policy settings:', err);
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return createPortal(
        <AnimatePresence>
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-0 bg-black/40 backdrop-blur-sm"
                    onClick={onClose}
                />
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="relative z-10 w-full max-w-md flex flex-col bg-[var(--app-panel)] border border-[var(--app-stroke)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/50">
                        <h2 className="text-[15px] font-semibold text-[var(--app-text)]">
                            {t('dnsPolicies.settingsTitle')}
                        </h2>
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                            aria-label={t('common.close')}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-5">
                        {/* 规则未匹配默认DNS服务器 */}
                        <div className="space-y-2">
                            <div>
                                <div className="text-[14px] font-medium text-[var(--app-text)]">
                                    {t('dnsPolicies.unmatchedServer.label')}
                                </div>
                                <p className="mt-1 text-[12px] text-[var(--app-text-tertiary)] leading-relaxed">
                                    {t('dnsPolicies.unmatchedServer.description')}
                                </p>
                            </div>
                            <Select
                                value={unmatchedServer}
                                onChange={e => setUnmatchedServer(e.target.value)}
                            >
                                {dnsServers.map(s => (
                                    <option key={s.id} value={s.id}>
                                        {s.name || s.id}
                                    </option>
                                ))}
                            </Select>
                        </div>

                        {/* 直连出站DNS服务器 */}
                        <div className="space-y-2">
                            <div>
                                <div className="text-[14px] font-medium text-[var(--app-text)]">
                                    {t('dnsPolicies.resolveServer.label')}
                                </div>
                                <p className="mt-1 text-[12px] text-[var(--app-text-tertiary)] leading-relaxed">
                                    {t('dnsPolicies.resolveServer.description')}
                                </p>
                            </div>
                            <Select
                                value={resolveServer}
                                onChange={e => setResolveServer(e.target.value)}
                            >
                                {dnsServers.map(s => (
                                    <option key={s.id} value={s.id}>
                                        {s.name || s.id}
                                    </option>
                                ))}
                            </Select>
                        </div>

                        {/* 代理节点DNS服务器 */}
                        <div className="space-y-2">
                            <div>
                                <div className="text-[14px] font-medium text-[var(--app-text)]">
                                    {t('dnsPolicies.proxyServer.label')}
                                </div>
                                <p className="mt-1 text-[12px] text-[var(--app-text-tertiary)] leading-relaxed">
                                    {t('dnsPolicies.proxyServer.description')}
                                </p>
                            </div>
                            <Select
                                value={proxyServer}
                                onChange={e => setProxyServer(e.target.value)}
                            >
                                {dnsServers.map(s => (
                                    <option key={s.id} value={s.id}>
                                        {s.name || s.id}
                                    </option>
                                ))}
                            </Select>
                        </div>

                    </div>

                    {/* Footer */}
                    <div className="flex shrink-0 items-center justify-end gap-2 px-6 py-4 border-t border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/30">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={onClose}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? t('common.saving') : t('common.save')}
                        </Button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>,
        document.body
    );
}
