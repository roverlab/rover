import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useDropdownPosition } from '../hooks/useDropdownPosition';
import { Download, RefreshCw, Plus, MoreVertical, Trash2, Loader2, Edit2, FileText, X, Copy, Layers, GripVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../components/Sidebar';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';
import { Badge, Card } from '../components/ui/Surface';
import { useNotificationState, NotificationList, useConfirm } from '../components/ui/Notification';
import { formatRelativeTime } from '../shared/date-utils';
import { GroupEditor } from './Profiles/components/GroupEditor';
import Sortable from 'sortablejs';

/** 格式化更新间隔显示 */
function formatInterval(seconds: number | undefined, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (seconds === 0 || !seconds) return t('profiles.noAutoUpdate');
  if (seconds < 60) return t('profiles.intervalSeconds', { count: seconds });
  if (seconds < 3600) return t('profiles.intervalMinutes', { count: Math.round(seconds / 60) });
  if (seconds < 86400) return t('profiles.intervalHours', { count: (seconds / 3600).toFixed(1) });
  return t('profiles.intervalDays', { count: Math.round(seconds / 86400) });
}

/** 订阅用户信息（从 Subscription-Userinfo 响应头解析） */
interface SubscriptionUserinfo {
  upload: number;
  download: number;
  total: number;
  expire: number;
}

interface Profile {
  id: string;
  name: string;
  type: 'remote' | 'local';
  url: string;
  path: string;
  selected: number;
  last_update: string;
  /** 更新间隔（秒），0 或 undefined 表示不自动更新 */
  updateInterval?: number;
  /** 订阅用户信息（流量、过期时间） */
  subscriptionUserinfo?: SubscriptionUserinfo;
  /** 代理节点列表 */
  nodes?: Array<{ name: string; type: string }>;
}

/** 格式化字节为可读字符串 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes < 1024 ** 4) return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
  return `${(bytes / (1024 ** 4)).toFixed(1)} TB`;
}

/** 格式化过期时间戳（Unix 秒），0 表示长期有效 */
function formatExpire(expire: number, t: (key: string) => string): string {
  if (!expire) return t('profiles.expireLongTerm');
  const date = new Date(expire * 1000);
  if (isNaN(date.getTime())) return '—';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;;
}

interface ProfilesProps {
  isActive?: boolean;
}

export function Profiles({ isActive = true }: ProfilesProps) {
const { t } = useTranslation();
const [profiles, setProfiles] = useState<Profile[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const { notifications, addNotification, removeNotification } = useNotificationState();
  const { confirm, ConfirmDialog } = useConfirm();
  const [refreshSeed, setRefreshSeed] = useState(0);

  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editInterval, setEditInterval] = useState(0);

  const [editingContentProfile, setEditingContentProfile] = useState<Profile | null>(null);
  const [editContent, setEditContent] = useState('');
  const [contentLoading, setContentLoading] = useState(false);

  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const { position: dropdownPosition, calculatePosition } = useDropdownPosition({ menuWidth: 144, menuHeight: 160 });
  const dropdownButtonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

  // 分组编辑器状态
  const [editingGroupProfile, setEditingGroupProfile] = useState<Profile | null>(null);

  // 拖拽排序相关
  const gridRef = useRef<HTMLDivElement>(null);
  const sortableRef = useRef<Sortable | null>(null);
  const profilesRef = useRef<Profile[]>(profiles);

  // 保持 profilesRef 最新
  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Don't close if clicking on the dropdown menu itself
      const target = e.target as HTMLElement;
      if (target.closest('.dropdown-menu')) return;
      setOpenDropdownId(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // 页面激活时刷新数据
  useEffect(() => {
    if (isActive) {
      setRefreshSeed(prev => prev + 1);
    }
  }, [isActive]);

    const handleOpenDropdown = (e: React.MouseEvent, profileId: string) => {
        e.stopPropagation();
        const button = dropdownButtonRefs.current[profileId];
        if (button) {
            calculatePosition(button);
        }
        setOpenDropdownId(openDropdownId === profileId ? null : profileId);
    };

  const loadProfiles = async () => {
    try {
      const data = await window.ipcRenderer.db.getProfiles();
      setProfiles(data);
    } catch (err) {
      console.error('Failed to load profiles', err);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, [refreshSeed]);

  const handleSelect = async (id: string) => {
    // 检查是否已经在选中状态，如果已选中则不做任何操作
    const currentSelected = profiles.find(p => p.selected === 1);
    if (currentSelected && currentSelected.id === id) {
      return; // 已经是当前选中的配置，不进行任何操作
    }

    try {
      await window.ipcRenderer.db.selectProfile(id);
      setProfiles(prev => prev.map(p => ({
        ...p,
        selected: p.id === id ? 1 : 0
      })));

      // 触发代理页面刷新
      setRefreshSeed(prev => prev + 1);

      // Regenerate config.json when switching profiles（写入时若内核运行中会自动重启）
      window.ipcRenderer.core.generateConfig();
    } catch (err: any) {
      console.error('Failed to select/switch profile', err);
      addNotification(`Failed to select: ${err.message}`, 'error');
    }
  };

  const handleUpdate = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    
    // 检查当前配置是否是激活状态
    const isActiveProfile = profiles.find(p => p.id === id)?.selected === 1;
    
    setUpdatingId(id);
    try {
      await window.ipcRenderer.core.updateProfile(id);
      await loadProfiles();
      
      // 如果更新的是当前激活的配置，需要重新生成 config.json（写入时若内核运行中会自动重启）
      if (isActiveProfile) {
        window.ipcRenderer.core.generateConfig();
      }
      
      addNotification(t('profiles.profileUpdated'));
    } catch (err: any) {
      console.error('Failed to update profile', err);
      addNotification(`${t('profiles.updateFailed')}: ${err.message}`, 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDownload = async () => {
    if (!urlInput || loading) return;
    const hadNoProfiles = profiles.length === 0;
    setLoading(true);
    try {
      const profileId = await window.ipcRenderer.core.addSubscriptionProfile(urlInput);
      setUrlInput('');
      await loadProfiles();
      // 没有 profile 时添加后自动选中
      if (hadNoProfiles && profileId) {
        await window.ipcRenderer.db.selectProfile(profileId);
        await loadProfiles();
        window.ipcRenderer.core.generateConfig();
        setRefreshSeed(prev => prev + 1); // 触发代理、策略等页面刷新
      }
      addNotification(t('profiles.profileAdded'));
    } catch (err) {
      console.error('Failed to add subscription', err);
      addNotification(`${t('profiles.addFailed')}: ${err?.message || 'Unknown'}`, 'error');
    } finally {
      setLoading(false);
      setUpdatingId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleDownload();
    }
  };

  const handleImportLocal = async () => {
    try {
      const hadNoProfiles = profiles.length === 0;
      const profileId = await window.ipcRenderer.core.importLocalProfile();
      if (profileId) {
        await loadProfiles();
        // 没有 profile 时添加后自动选中
        if (hadNoProfiles) {
          await window.ipcRenderer.db.selectProfile(profileId);
          await loadProfiles();
          window.ipcRenderer.core.generateConfig();
        }
        addNotification(t('profiles.profileImported'));
      }
    } catch (err: any) {
      console.error('Failed to import local profile', err);
      addNotification(err.message || t('profiles.addFailed'), 'error');
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setOpenDropdownId(null);
    const deletedWasSelected = profiles.find(p => p.id === id)?.selected === 1;
    const confirmed = await confirm({
      title: t('profiles.deleteConfirm'),
      message: t('profiles.deleteConfirmMessage'),
      confirmText: t('profiles.delete'),
      cancelText: t('common.cancel'),
      variant: 'danger'
    });
    if (!confirmed) return;
    try {
      await window.ipcRenderer.db.deleteProfile(id);
      const remaining = await window.ipcRenderer.db.getProfiles();
      // 删除当前使用的配置时，自动选中剩余的第一个
      if (deletedWasSelected && remaining.length > 0) {
        const firstId = remaining[0].id;
        await window.ipcRenderer.db.selectProfile(firstId);
        window.ipcRenderer.core.generateConfig();
      }
      if (deletedWasSelected) setRefreshSeed(prev => prev + 1); // 删除的是当前选中配置时，触发代理、策略等页面刷新
      await loadProfiles();
      addNotification(t('profiles.profileDeleted'));
    } catch (err) {
      console.error('Failed to delete profile', err);
      addNotification(t('profiles.updateFailed'), 'error');
    }
  };

  const openEditDetails = (e: React.MouseEvent, profile: Profile) => {
    e.stopPropagation();
    setEditingProfile(profile);
    setEditName(profile.name);
    setEditUrl(profile.url || '');
    setEditInterval(profile.updateInterval || 0);
  };

  const handleSaveDetails = async () => {
    if (!editingProfile) return;
    try {
      await window.ipcRenderer.db.updateProfileDetails(editingProfile.id, editName, editUrl, editInterval);
      await loadProfiles();
      addNotification(t('profiles.profileUpdated'));
      setEditingProfile(null);
    } catch (err: any) {
      console.error('Failed to update profile details', err);
      addNotification(err.message || t('profiles.updateFailed'), 'error');
    }
  };

  const openEditContent = async (e: React.MouseEvent, profile: Profile) => {
    e.stopPropagation();
    setEditingContentProfile(profile);
    setEditContent('');
    setContentLoading(true);

    try {
      const content = await window.ipcRenderer.db.getProfileContent(profile.id);
      let displayContent = content ?? '';
      // Attempt to pretty-print JSON if possible, else show raw content
      if (displayContent && typeof displayContent === 'string' && displayContent.trim().startsWith('{')) {
        try {
          displayContent = JSON.stringify(JSON.parse(displayContent), null, 2);
        } catch {
          // ignore parsing errors, show raw
        }
      }
      setEditContent(displayContent);
    } catch (err) {
      console.error('Failed to load profile content', err);
      addNotification(t('profiles.loadContentFailed'), 'error');
      setEditingContentProfile(null);
    } finally {
      setContentLoading(false);
    }
  };

  const closeContentModal = () => {
    setEditingContentProfile(null);
    setContentLoading(false);
  };

  const handleCopyContent = async () => {
    if (!editContent) return;
    try {
      await navigator.clipboard.writeText(editContent);
      addNotification(t('profiles.copiedToClipboard'));
    } catch (err) {
      addNotification(t('profiles.copyFailed'), 'error');
    }
  };

  // 拖拽排序：保存新顺序到数据库
  const persistProfilesOrder = useCallback(async (orderedIds: string[]) => {
    try {
      await window.ipcRenderer.db.updateProfilesOrder(orderedIds);
    } catch (err) {
      console.error('Failed to update profiles order:', err);
      addNotification(t('profiles.reorderFailed'), 'error');
      loadProfiles(); // 恢复原始顺序
    }
  }, [addNotification, t]);

  // 初始化拖拽排序（只在组件挂载时执行一次）
  useEffect(() => {
    if (!gridRef.current) return;

    sortableRef.current = Sortable.create(gridRef.current, {
      animation: 200,
      handle: '.drag-handle',
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      onEnd: (evt) => {
        if (evt.oldIndex === evt.newIndex) return;
        const currentProfiles = profilesRef.current;
        const newProfiles = [...currentProfiles];
        const [movedItem] = newProfiles.splice(evt.oldIndex!, 1);
        newProfiles.splice(evt.newIndex!, 0, movedItem);
        setProfiles(newProfiles);
        persistProfilesOrder(newProfiles.map(p => p.id));
      },
    });

    return () => {
      sortableRef.current?.destroy();
      sortableRef.current = null;
    };
  }, [persistProfilesOrder]);

  return (
    <div className="page-shell relative overflow-hidden">
      {/* Notification - 使用 Portal 渲染到 body，避免被弹窗遮挡 */}
      <NotificationList notifications={notifications} onRemove={removeNotification} />

      <div className="page-header" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div>
          <h1 className="page-title">{t('profiles.title')}</h1>
          <p className="page-subtitle">{t('profiles.subtitle')}</p>
        </div>
      </div>

      <div className="page-content">
        <div className="pb-5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="flex flex-wrap gap-2.5">
            <Input
              type="text"
              placeholder={t('profiles.subscriptionUrl')}
              className="flex-1 min-w-[280px]"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <Button
              onClick={handleDownload}
              disabled={loading}
              variant="primary"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span>{loading ? t('profiles.adding') : t('profiles.addRemote')}</span>
            </Button>
            <Button variant="secondary" onClick={handleImportLocal}>
              <Plus className="w-3.5 h-3.5" />
              <span>{t('profiles.importLocal')}</span>
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {profiles.map((profile) => (
              <Card
                key={profile.id}
                onClick={() => handleSelect(profile.id)}
                className={cn(
                  "relative p-4 cursor-pointer transition-all flex flex-col h-40 group shadow-none",
                  profile.selected
                    ? "border-[var(--app-accent-border)] bg-[var(--app-accent-soft-card)]"
                    : "hover:border-[rgba(39,44,54,0.14)] hover:bg-white/80"
                )}
              >
                <div className="relative flex justify-between items-start mb-1.5 z-10">
                  <div className="flex items-center gap-2 min-w-0 pr-3">
                    {/* 拖拽手柄 */}
                    <div className="drag-handle sortable-handle flex-shrink-0 cursor-grab active:cursor-grabbing text-[var(--app-text-quaternary)] hover:text-[var(--app-text-secondary)] transition-colors">
                      <GripVertical className="w-4 h-4" />
                    </div>
                    <h3 className="font-medium text-[14px] text-[var(--app-text)] truncate max-w-[160px]">{profile.name}</h3>
                    <span className="shrink-0 text-[11px] text-[var(--app-text-tertiary)]">{profile.nodes?.length ?? 0} {t('profiles.nodes')}</span>
                  </div>
                  <div className={cn("flex space-x-0.5 transition-opacity", openDropdownId === profile.id ? "opacity-100 relative z-50" : "opacity-100")}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-[var(--app-text-quaternary)] hover:text-[var(--app-text-secondary)] relative z-50"
                      ref={(el) => { dropdownButtonRefs.current[profile.id] = el; }}
                      onClick={(e) => handleOpenDropdown(e, profile.id)}
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* Dropdown Menu */}
                  {openDropdownId === profile.id && createPortal(
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -5 }}
                      transition={{ duration: 0.15 }}
                      className="dropdown-menu fixed bg-white border border-[rgba(39,44,54,0.08)] rounded-[12px] shadow-[var(--shadow-elevated)] overflow-hidden z-[200] flex flex-col py-1.5 w-36"
                      style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="flex items-center px-3 py-1.5 text-[12px] text-[var(--app-text-secondary)] hover:bg-[var(--app-bg-secondary)] hover:text-[var(--app-text)] transition-colors text-left w-full"
                        onClick={(e) => {
                          setOpenDropdownId(null);
                          openEditDetails(e, profile);
                        }}
                      >
                        <Edit2 className="w-3.5 h-3.5 mr-2" />
                        {t('profiles.edit')}
                      </button>
                      <button
                        className="flex items-center px-3 py-1.5 text-[12px] text-[var(--app-text-secondary)] hover:bg-[var(--app-bg-secondary)] hover:text-[var(--app-text)] transition-colors text-left w-full"
                        onClick={(e) => {
                          setOpenDropdownId(null);
                          openEditContent(e, profile);
                        }}
                      >
                        <FileText className="w-3.5 h-3.5 mr-2" />
                        {t('profiles.view')}
                      </button>
                      <button
                        className="flex items-center px-3 py-1.5 text-[12px] text-[var(--app-text-secondary)] hover:bg-[var(--app-bg-secondary)] hover:text-[var(--app-text)] transition-colors text-left w-full"
                        onClick={() => {
                          setOpenDropdownId(null);
                          setEditingGroupProfile(profile);
                        }}
                      >
                        <Layers className="w-3.5 h-3.5 mr-2" />
                        {t('profiles.customGroups')}
                      </button>
                      <div className="mx-2 my-1 border-t border-[rgba(39,44,54,0.06)]" />
                      <button
                        className="flex items-center px-3 py-1.5 text-[12px] text-[var(--app-danger)] hover:bg-[rgba(177,79,94,0.08)] transition-colors text-left w-full"
                        onClick={(e) => {
                          setOpenDropdownId(null);
                          handleDelete(e, profile.id);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" />
                        {t('profiles.delete')}
                      </button>
                    </motion.div>,
                    document.body
                  )}
                </div>

                <div className="mt-1 flex-1 flex flex-col justify-center gap-1">
                  {/* 流量信息 */}
                  {profile.subscriptionUserinfo ? (
                    <>
                      <div className="h-1.5 w-full rounded-full bg-[var(--app-bg-secondary)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--app-accent)] transition-all"
                          style={{ width: `${Math.min(100, profile.subscriptionUserinfo.total > 0 ? ((profile.subscriptionUserinfo.upload + profile.subscriptionUserinfo.download) / profile.subscriptionUserinfo.total) * 100 : 0)}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-[var(--app-text-tertiary)] truncate w-full" title={`${t('profiles.used')} ${formatBytes(profile.subscriptionUserinfo.upload + profile.subscriptionUserinfo.download)} / ${t('profiles.total')} ${formatBytes(profile.subscriptionUserinfo.total)} · ${formatExpire(profile.subscriptionUserinfo.expire, t)}`}>
                        {t('profiles.used')} {formatBytes(profile.subscriptionUserinfo.upload + profile.subscriptionUserinfo.download)} / {t('profiles.total')} {formatBytes(profile.subscriptionUserinfo.total)} · {formatExpire(profile.subscriptionUserinfo.expire, t)}
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="flex items-center justify-between mt-3">
                  <div className="text-[11px] text-[var(--app-text-quaternary)]">
                    <span>{t('profiles.lastUpdate')}: {profile.last_update ? formatRelativeTime(profile.last_update) : t('profiles.never')}</span>
                  </div>
                  {profile.url && (
                    <Button
                      variant={updatingId === profile.id ? 'tonal' : 'ghost'}
                      size="icon"
                      onClick={(e) => handleUpdate(e, profile.id)}
                      disabled={updatingId !== null}
                      title={t('profiles.update')}
                    >
                      {updatingId === profile.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  )}
                </div>


              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog />

      {/* Edit Details Modal */}
      {createPortal(
        <AnimatePresence>
          {editingProfile && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setEditingProfile(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative z-10 w-full max-w-md bg-white border border-[rgba(39,44,54,0.08)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/50">
                <h2 className="text-[15px] font-semibold text-[var(--app-text)]">{t('profiles.editProfile')}</h2>
                <button
                  type="button"
                  onClick={() => setEditingProfile(null)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                  aria-label={t('common.close')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">{t('profiles.profileName')}</label>
                  <Input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    placeholder={t('profiles.profileName')}
                  />
                </div>

                {editingProfile.type === 'remote' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">{t('profiles.subscriptionUrlLabel')}</label>
                      <Input
                        value={editUrl}
                        onChange={e => setEditUrl(e.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">
                        {t('profiles.updateInterval')}
                        <span className="text-[var(--app-text-tertiary)] font-normal ml-1">{t('profiles.updateIntervalHint')}</span>
                      </label>
                      <Input
                        type="number"
                        value={editInterval}
                        onChange={e => setEditInterval(Number(e.target.value))}
                        placeholder="86400"
                        min={0}
                      />
                      <div className="text-[11px] text-[var(--app-text-quaternary)]">
                        {t('profiles.commonIntervals')}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/30">
                <Button variant="ghost" onClick={() => setEditingProfile(null)}>
                  {t('common.cancel')}
                </Button>
                <Button variant="primary" onClick={handleSaveDetails} disabled={!editName.trim() || (editingProfile.type === 'remote' && !editUrl.trim())}>
                  {t('common.save')}
                </Button>
              </div>
            </motion.div>
          </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Edit Content Modal */}
      {createPortal(
        <AnimatePresence>
          {editingContentProfile && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-0 bg-black/40 backdrop-blur-sm"
              onClick={closeContentModal}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative z-10 w-full max-w-3xl h-[80vh] flex flex-col bg-white border border-[rgba(39,44,54,0.08)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/50">
                <div className="flex flex-col">
                  <h2 className="text-[15px] font-semibold text-[var(--app-text)]">{t('profiles.viewConfig')}</h2>
                  <span className="text-[12px] text-[var(--app-text-tertiary)]">{editingContentProfile.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleCopyContent}
                    disabled={contentLoading || !editContent}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={t('common.copy')}
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={closeContentModal}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                    aria-label={t('common.close')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 p-0 relative bg-[var(--app-bg-secondary)]/20">
                {contentLoading ? (
                  <div className="flex items-center justify-center h-full text-[var(--app-text-tertiary)]">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    {t('common.loading')}
                  </div>
                ) : (
                  <textarea
                    value={editContent}
                    readOnly
                    className="w-full h-full p-4 font-mono text-[13px] text-[var(--app-text)] bg-transparent resize-none focus:outline-none cursor-default"
                    spellCheck={false}
                    placeholder=""
                  />
                )}
              </div>
            </motion.div>
          </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Group Editor Modal */}
      {editingGroupProfile && (
        <GroupEditor
          profileId={editingGroupProfile.id}
          profileName={editingGroupProfile.name}
          onClose={() => setEditingGroupProfile(null)}
          onSave={() => {
            // 刷新 profiles 列表
            setRefreshSeed(prev => prev + 1);
            loadProfiles();
          }}
        />
      )}

    </div>
  );
}
