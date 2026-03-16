import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Download, RefreshCw, Plus, MoreVertical, Trash2, Loader2, Edit2, FileText, X, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../components/Sidebar';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';
import { Badge, Card } from '../components/ui/Surface';
import { useNotificationState, NotificationList, useConfirm } from '../components/ui/Notification';
import { useProfile } from '../contexts/ProfileContext';
import { formatRelativeTime } from '../shared/date-utils';

/** 格式化更新间隔显示 */
function formatInterval(seconds: number | undefined): string {
  if (seconds === 0 || !seconds) return '不自动更新';
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} 小时`;
  return `${Math.round(seconds / 86400)} 天`;
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
function formatExpire(expire: number): string {
  if (!expire) return '长期有效';
  const date = new Date(expire * 1000);
  if (isNaN(date.getTime())) return '—';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;;
}

export function Profiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const { notifications, addNotification, removeNotification } = useNotificationState();
  const { confirm, ConfirmDialog } = useConfirm();
  const { refreshSeed, seed } = useProfile();

  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editInterval, setEditInterval] = useState(0);

  const [editingContentProfile, setEditingContentProfile] = useState<Profile | null>(null);
  const [editContent, setEditContent] = useState('');
  const [contentLoading, setContentLoading] = useState(false);

  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const dropdownButtonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

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

  const handleOpenDropdown = (e: React.MouseEvent, profileId: string) => {
    e.stopPropagation();
    const button = dropdownButtonRefs.current[profileId];
    if (button) {
      const rect = button.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.right - 144 // 144 is menu width (w-36)
      });
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
  }, [seed]);

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

      // 更新 seed，触发代理页面刷新
      refreshSeed();

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
      
      addNotification('Profile updated successfully');
    } catch (err: any) {
      console.error('Failed to update profile', err);
      addNotification(`Update failed: ${err.message}`, 'error');
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
        refreshSeed(); // 触发代理、策略等页面刷新
      }
      addNotification('订阅已添加');
    } catch (err) {
      console.error('Failed to add subscription', err);
      addNotification('添加失败: ' + (err?.message || '未知错误'), 'error');
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
        addNotification('Local profile imported successfully');
      }
    } catch (err: any) {
      console.error('Failed to import local profile', err);
      addNotification(err.message || 'Failed to import local profile', 'error');
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setOpenDropdownId(null);
    const deletedWasSelected = profiles.find(p => p.id === id)?.selected === 1;
    const confirmed = await confirm({
      title: '删除配置',
      message: '确定要删除这个配置吗？',
      confirmText: '删除',
      cancelText: '取消',
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
      if (deletedWasSelected) refreshSeed(); // 删除的是当前选中配置时，触发代理、策略等页面刷新
      await loadProfiles();
      addNotification('Profile deleted');
    } catch (err) {
      console.error('Failed to delete profile', err);
      addNotification('Failed to delete profile', 'error');
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
      addNotification('Profile updated');
      setEditingProfile(null);
    } catch (err: any) {
      console.error('Failed to update profile details', err);
      addNotification(err.message || 'Failed to update details', 'error');
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
      addNotification('加载配置内容失败', 'error');
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
      addNotification('已复制到剪贴板');
    } catch (err) {
      addNotification('复制失败', 'error');
    }
  };

  return (
    <div className="page-shell relative overflow-hidden">
      {/* Notification - 使用 Portal 渲染到 body，避免被弹窗遮挡 */}
      <NotificationList notifications={notifications} onRemove={removeNotification} />

      <div className="page-header" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div>
          <h1 className="page-title">配置</h1>
          <p className="page-subtitle">添加订阅、导入本地配置、切换与更新配置文件。</p>
        </div>
      </div>

      <div className="page-content">
        <div className="pb-5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="flex flex-wrap gap-2.5">
            <Input
              type="text"
              placeholder="订阅地址 (Clash YAML / Sing-box JSON)"
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
              <span>{loading ? '添加中...' : '添加远程'}</span>
            </Button>
            <Button variant="secondary" onClick={handleImportLocal}>
              <Plus className="w-3.5 h-3.5" />
              <span>本地导入</span>
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {profiles.map((profile) => (
              <Card
                key={profile.id}
                onClick={() => handleSelect(profile.id)}
                className={cn(
                  "relative p-4 cursor-pointer transition-all flex flex-col h-40 group",
                  profile.selected
                    ? "border-[var(--app-accent-border)] bg-[var(--app-accent-soft-card)]"
                    : "hover:border-[rgba(39,44,54,0.14)] hover:bg-white/80"
                )}
              >
                <div className="relative flex justify-between items-start mb-1.5 z-10">
                  <h3 className="font-medium text-[14px] text-[var(--app-text)] truncate pr-3">{profile.name}</h3>
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
                        编辑
                      </button>
                      <button
                        className="flex items-center px-3 py-1.5 text-[12px] text-[var(--app-text-secondary)] hover:bg-[var(--app-bg-secondary)] hover:text-[var(--app-text)] transition-colors text-left w-full"
                        onClick={(e) => {
                          setOpenDropdownId(null);
                          openEditContent(e, profile);
                        }}
                      >
                        <FileText className="w-3.5 h-3.5 mr-2" />
                        查看
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
                        删除
                      </button>
                    </motion.div>,
                    document.body
                  )}
                </div>

                <div className="mt-1 min-h-[2rem] flex flex-col justify-center gap-1">
                  {profile.subscriptionUserinfo ? (
                    <>
                      <div className="h-1.5 w-full rounded-full bg-[var(--app-bg-secondary)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--app-accent)] transition-all"
                          style={{ width: `${Math.min(100, profile.subscriptionUserinfo.total > 0 ? ((profile.subscriptionUserinfo.upload + profile.subscriptionUserinfo.download) / profile.subscriptionUserinfo.total) * 100 : 0)}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-[var(--app-text-tertiary)] truncate w-full" title={`已用 ${formatBytes(profile.subscriptionUserinfo.upload + profile.subscriptionUserinfo.download)} / 总 ${formatBytes(profile.subscriptionUserinfo.total)} · 到期 ${formatExpire(profile.subscriptionUserinfo.expire)}`}>
                        已用 {formatBytes(profile.subscriptionUserinfo.upload + profile.subscriptionUserinfo.download)} / 总 {formatBytes(profile.subscriptionUserinfo.total)} ·  {formatExpire(profile.subscriptionUserinfo.expire)}
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center text-[11px] text-[var(--app-text-quaternary)]">
                    <span>更新时间: {profile.last_update ? formatRelativeTime(profile.last_update) : 'Never'}</span>
                  </div>
                  {profile.url && (
                    <Button
                      variant={updatingId === profile.id ? 'tonal' : 'secondary'}
                      size="icon"
                      onClick={(e) => handleUpdate(e, profile.id)}
                      disabled={updatingId !== null}
                      title="更新配置"
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
                <h2 className="text-[15px] font-semibold text-[var(--app-text)]">Edit Profile</h2>
                <button
                  type="button"
                  onClick={() => setEditingProfile(null)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                  aria-label="关闭"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">Name</label>
                  <Input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    placeholder="Profile Name"
                  />
                </div>

                {editingProfile.type === 'remote' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">Subscription URL</label>
                      <Input
                        value={editUrl}
                        onChange={e => setEditUrl(e.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">
                        更新间隔 (秒)
                        <span className="text-[var(--app-text-tertiary)] font-normal ml-1">（0 表示不自动更新）</span>
                      </label>
                      <Input
                        type="number"
                        value={editInterval}
                        onChange={e => setEditInterval(Number(e.target.value))}
                        placeholder="86400 (24小时)"
                        min={0}
                      />
                      <div className="text-[11px] text-[var(--app-text-quaternary)]">
                        常用: 3600 (1小时), 21600 (6小时), 43200 (12小时), 86400 (24小时)
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/30">
                <Button variant="ghost" onClick={() => setEditingProfile(null)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleSaveDetails} disabled={!editName.trim() || (editingProfile.type === 'remote' && !editUrl.trim())}>
                  Save Changes
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
                  <h2 className="text-[15px] font-semibold text-[var(--app-text)]">查看配置</h2>
                  <span className="text-[12px] text-[var(--app-text-tertiary)]">{editingContentProfile.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleCopyContent}
                    disabled={contentLoading || !editContent}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="复制"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={closeContentModal}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                    aria-label="关闭"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 p-0 relative bg-[var(--app-bg-secondary)]/20">
                {contentLoading ? (
                  <div className="flex items-center justify-center h-full text-[var(--app-text-tertiary)]">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    加载中...
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

    </div>
  );
}
