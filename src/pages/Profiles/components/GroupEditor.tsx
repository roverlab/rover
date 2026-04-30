import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X, Plus, Trash2, ChevronDown, ChevronUp, Edit2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import type { CustomProxyGroup, ProxyNode } from '../../../electron';
import { GroupEditModal, type GroupEditData } from './GroupEditModal';

interface GroupEditorProps {
    profileId: string;
    profileName: string;
    onClose: () => void;
    onSave: () => void;
}

export function GroupEditor({ profileId, profileName, onClose, onSave }: GroupEditorProps) {
    const { t } = useTranslation();
    const [groups, setGroups] = useState<CustomProxyGroup[]>([]);
    const [availableNodes, setAvailableNodes] = useState<ProxyNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // 编辑弹框状态
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editMode, setEditMode] = useState<'add' | 'edit'>('add');
    const [editingGroup, setEditingGroup] = useState<CustomProxyGroup | null>(null);

    // 加载分组和节点数据
    useEffect(() => {
        const loadData = async () => {
            try {
                // 加载已有的自定义分组
                const customGroups = await window.ipcRenderer.db.getProfileCustomGroups(profileId);
                setGroups(customGroups);

                // 从数据库加载 profile 的节点列表
                const nodes = await window.ipcRenderer.db.getProfileNodes(profileId);
                setAvailableNodes(nodes);

                if (nodes.length === 0) {
                    console.log('[GroupEditor] No nodes found in profile, please update subscription first');
                }
            } catch (err) {
                console.error('Failed to load group data:', err);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [profileId]);

    // 开始添加新分组
    const startAddNew = () => {
        setEditMode('add');
        setEditingGroup(null);
        setEditModalOpen(true);
    };

    // 开始编辑分组
    const startEdit = (group: CustomProxyGroup) => {
        setEditMode('edit');
        setEditingGroup(group);
        setEditModalOpen(true);
    };

    // 处理编辑弹框保存
    const handleEditSave = (data: GroupEditData) => {
        if (editMode === 'add') {
            // 添加新分组
            const newGroup: CustomProxyGroup = {
                name: data.name,
                type: data.type,
                outbounds: data.outbounds,
                order: groups.length
            };
            setGroups(prev => [...prev, newGroup]);
        } else {
            // 编辑现有分组
            setGroups(prev => prev.map(g => {
                if (g.name === data.originalName) {
                    return {
                        ...g,
                        name: data.name,
                        type: data.type,
                        outbounds: data.outbounds
                    };
                }
                return g;
            }));
        }
        setEditModalOpen(false);
    };

    // 删除分组
    const deleteGroup = (groupName: string) => {
        if (!confirm(t('profiles.groupEditor.deleteConfirm', { name: groupName }))) return;
        setGroups(prev => prev.filter(g => g.name !== groupName));
    };

    // 上移分组
    const moveUp = (index: number) => {
        if (index <= 0) return;
        setGroups(prev => {
            const newGroups = [...prev];
            [newGroups[index - 1], newGroups[index]] = [newGroups[index], newGroups[index - 1]];
            // 更新 order
            return newGroups.map((g, i) => ({ ...g, order: i }));
        });
    };

    // 下移分组
    const moveDown = (index: number) => {
        if (index >= groups.length - 1) return;
        setGroups(prev => {
            const newGroups = [...prev];
            [newGroups[index], newGroups[index + 1]] = [newGroups[index + 1], newGroups[index]];
            // 更新 order
            return newGroups.map((g, i) => ({ ...g, order: i }));
        });
    };

    // 保存所有更改
    const saveAll = async () => {
        setSaving(true);
        try {
            await window.ipcRenderer.db.setProfileCustomGroups(profileId, groups);

            // 判断当前 profile 是否正在使用，如果是则重新生成配置文件
            const selectedProfile = await window.ipcRenderer.core.getSelectedProfile();
            if (selectedProfile?.profile?.id === profileId) {
                console.log('[GroupEditor] Current profile is in use, regenerating config...');
                window.ipcRenderer.core.generateConfig();
            }

            onSave();
            onClose();
        } catch (err: any) {
            console.error('Failed to save groups:', err);
            alert(t('profiles.groupEditor.saveFailed', { error: err.message }));
        } finally {
            setSaving(false);
        }
    };

    // 已存在的分组名称列表
    const existingNames = useMemo(() => groups.map(g => g.name), [groups]);

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
                    className="relative z-10 w-full max-w-2xl max-h-[85vh] flex flex-col bg-[var(--app-panel)] border border-[var(--app-stroke)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/50">
                        <div>
                            <h2 className="text-[15px] font-semibold text-[var(--app-text)]">{t('profiles.groupEditor.title')}</h2>
                            <p className="text-[12px] text-[var(--app-text-tertiary)]">{profileName}</p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors"
                            aria-label={t('common.close')}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6">
                        {loading ? (
                            <div className="flex items-center justify-center py-12 text-[var(--app-text-tertiary)]">
                                {t('profiles.groupEditor.loading')}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* 说明 */}
                                <div className="text-[12px] text-[var(--app-text-tertiary)] bg-[var(--app-bg-secondary)] rounded-[10px] p-3">
                                    {t('profiles.groupEditor.intro')}
                                </div>

                                {/* 分组列表 */}
                                {groups.length > 0 && (
                                    <div className="space-y-2">
                                        {groups.map((group, index) => (
                                            <div
                                                key={group.name}
                                                className="flex items-center gap-2 p-3 bg-[var(--app-panel-soft)] rounded-[10px] border border-[var(--app-stroke)]"
                                            >
                                                {/* 排序按钮 */}
                                                <div className="flex flex-col gap-0.5">
                                                    <button
                                                        onClick={() => moveUp(index)}
                                                        disabled={index === 0}
                                                        className="p-0.5 text-[var(--app-text-quaternary)] hover:text-[var(--app-text)] disabled:opacity-30"
                                                    >
                                                        <ChevronUp className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => moveDown(index)}
                                                        disabled={index === groups.length - 1}
                                                        className="p-0.5 text-[var(--app-text-quaternary)] hover:text-[var(--app-text)] disabled:opacity-30"
                                                    >
                                                        <ChevronDown className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>

                                                {/* 分组信息 */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-[13px] text-[var(--app-text)] truncate">{group.name}</span>
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded-[4px] bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)]">
                                                            {group.type === 'selector' ? t('profiles.groupEditor.badgeSelector') : t('profiles.groupEditor.badgeUrltest')}
                                                        </span>
                                                    </div>
                                                    <div className="text-[11px] text-[var(--app-text-quaternary)] truncate mt-0.5">
                                                        {t('profiles.groupEditor.nodesLine', {
                                                            count: group.outbounds.length,
                                                            preview: group.outbounds.slice(0, 3).join(', ') + (group.outbounds.length > 3 ? '...' : ''),
                                                        })}
                                                    </div>
                                                </div>

                                                {/* 操作按钮 */}
                                                <button
                                                    onClick={() => startEdit(group)}
                                                    className="p-1.5 rounded-[6px] text-[var(--app-text-quaternary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => deleteGroup(group.name)}
                                                    className="p-1.5 rounded-[6px] text-[var(--app-text-quaternary)] hover:bg-[rgba(177,79,94,0.08)] hover:text-[var(--app-danger)]"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* 添加按钮 */}
                                <button
                                    onClick={startAddNew}
                                    className="w-full flex items-center justify-center gap-2 p-3 text-[13px] text-[var(--app-text-secondary)] bg-[var(--app-panel-soft)] rounded-[10px] border border-dashed border-[var(--app-stroke)] hover:border-[var(--app-accent)] hover:text-[var(--app-accent-strong)] transition-colors"
                                >
                                    <Plus className="w-4 h-4" />
                                    {t('profiles.groupEditor.addGroup')}
                                </button>

                                {/* 无节点提示 */}
                                {availableNodes.length === 0 && !loading && (
                                    <div className="text-center py-6 text-[var(--app-text-tertiary)] text-[13px]">
                                        {t('profiles.groupEditor.noNodesHint')}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/30">
                        <div className="text-[12px] text-[var(--app-text-tertiary)]">
                            {groups.length > 0 ? t('profiles.groupEditor.footerDefined', { count: groups.length }) : t('profiles.groupEditor.footerNone')}
                        </div>
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={onClose}>
                                {t('common.cancel')}
                            </Button>
                            <Button variant="primary" onClick={saveAll} disabled={saving || loading}>
                                {saving ? t('profiles.groupEditor.saving') : t('profiles.groupEditor.saveChanges')}
                            </Button>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* 添加/编辑分组弹框 */}
            <GroupEditModal
                open={editModalOpen}
                onClose={() => setEditModalOpen(false)}
                onSave={handleEditSave}
                availableNodes={availableNodes}
                mode={editMode}
                initialData={editingGroup ? {
                    name: editingGroup.name,
                    type: editingGroup.type,
                    outbounds: editingGroup.outbounds,
                    originalName: editingGroup.name,
                } : undefined}
                existingNames={existingNames}
            />
        </AnimatePresence>,
        document.body
    );
}
