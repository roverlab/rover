import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Trash2, Pause, Play, Search, MoreVertical, FileX2, X, ArrowUp, Loader2, Copy, Check, ScrollText } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';
import { Badge } from '../components/ui/Surface';
import { useConfirm } from '../components/ui/Notification';
import './Logs.css';

interface LogEntry {
  id: number;
  time: string;
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
  /** 配置解析错误时的友好提示 */
  configHint?: string;
}

interface LogsProps {
  isActive?: boolean;
}

// 每次请求最多返回的日志条数
const MAX_RESULTS = 200;

/** 移除 ANSI 转义序列，支持常见格式 */
function stripAnsi(str: string): string {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\x1b\[[0-9;]*m/g, '')           // 标准 ANSI 颜色/样式
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')   // 光标控制等
    .replace(/\x1b\]8;;[^\x07]*\x07/g, '')   // OSC 8 超链接
    .replace(/\x1b\][^\x07\x1b]*[\x07\x1b]?/g, '')  // 其他 OSC
    // 处理已经失去 \x1b 前缀的残留 ANSI 码（如 [36m、[0m、[1;31m）
    // 只匹配 CSI 风格的残留码：数字+字母结尾（常见字母：m K A B C D s u J H f）
    .replace(/\[(?:[0-9]{1,3}(?:;[0-9]{1,3})*)?[mKHfABCDsJu]/g, '');
}

/** 从配置解析错误消息中提取友好提示 */
function parseConfigErrorHint(message: string): string | null {
  if (!message || typeof message !== 'string') return null;
  const m = message;
  // decode config at path: field: json: unknown field "xxx"
  const unknownField = m.match(/unknown field ["']([^"']+)["']/i);
  const pathMatch = m.match(/(?:route\.rules\[\d+\]\.|route\.|dns\.)[\w.\[\]]*/);
  if (unknownField) {
    const field = unknownField[1];
    const path = pathMatch ? pathMatch[0] : '配置';
    if (field === 'rule_set') {
      return `route.rules 中的 rule_set 字段需要 sing-box 1.8.0+，请升级内核或检查策略规则（${path}）`;
    }
    return `配置解析失败：${path} 包含不支持的字段 "${field}"`;
  }
  if (m.includes('decode config') || m.includes('decode error')) {
    return '配置解析失败，请检查 config.json 格式或前往「策略」页修正规则';
  }
  return null;
}

const MAX_MESSAGE_LENGTH = 4096;

function parseLogLine(line: string): { level: LogEntry['level']; message: string; time: string; configHint?: string } {
  if (line == null || typeof line !== 'string') return { level: 'info', message: '', time: '—' };
  const trimmed = line.trim();
  if (!trimmed) return { level: 'info', message: '', time: '—' };

  let clean: string;
  try {
    clean = stripAnsi(trimmed);
    // 移除不可打印字符，保留换行和常见符号
    clean = clean.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  } catch {
    return { level: 'info', message: trimmed.slice(0, 200), time: '—' };
  }

  // EXIT 行
  if (clean.startsWith('EXIT:')) {
    return { level: 'info', message: clean, time: '—' };
  }

  // 带时间戳: +0800 2026-03-14 20:36:17 ERROR [id duration] message
  const timestampMatch = clean.match(/^(\+\d{4}\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(.+)$/);
  let timeStr = '—';
  let rest = clean;
  if (timestampMatch) {
    const [, ts, after] = timestampMatch;
    timeStr = (ts || '').replace(/^\+\d{4}\s+/, ''); // 去掉时区
    rest = after ?? rest;
  }

  // 解析级别: FATAL|ERROR|WARN|INFO|DEBUG|TRACE|PANIC，可能带 [0000] 或 [id duration]
  const levelMatch = rest.match(/^(FATAL|ERROR|WARN|INFO|DEBUG|TRACE|PANIC)(?:\[\d+\])?\s+(?:\[\d+\s+[\d.]+(?:ms|s)\]\s+)?(.*)$/);
  let level: LogEntry['level'] = 'info';
  let message = rest;
  if (levelMatch) {
    const rawLevel = (levelMatch[1] || '').toLowerCase();
    level = rawLevel === 'warn' ? 'warning'
      : rawLevel === 'fatal' || rawLevel === 'panic' ? 'error'
      : (rawLevel === 'info' || rawLevel === 'warning' || rawLevel === 'error' || rawLevel === 'debug' ? rawLevel : 'info');
    message = (levelMatch[2] ?? rest).trim() || rest;
  }

  // 超长消息截断
  if (message.length > MAX_MESSAGE_LENGTH) {
    message = message.slice(0, MAX_MESSAGE_LENGTH) + '…';
  }

  const configHint = (level === 'error' && (message.includes('decode config') || message.includes('unknown field')))
    ? parseConfigErrorHint(message)
    : undefined;

  return { level, message, time: timeStr, configHint };
}

export function Logs({ isActive = true }: LogsProps) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const idCounter = useRef(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const { confirm, ConfirmDialog } = useConfirm();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    log: LogEntry | null;
  }>({ visible: false, x: 0, y: 0, log: null });
  const [copied, setCopied] = useState(false);

  // 是否处于搜索模式
  const isInSearchMode = searchText.trim() !== '';

  // 统计总条数
  const totalCount = logs.length;

  // 构建搜索文本：级别 + 搜索词，用空格分割
  const buildSearchText = useCallback(() => {
    const parts: string[] = [];
    if (searchText.trim()) {
      parts.push(searchText.trim());
    }
    return parts.join(' ');
  }, [searchText]);

  // 从后台获取日志
  const fetchLogs = useCallback(async () => {
    if (!isActive) return;
    
    setIsSearching(true);
    try {
      const result = await window.ipcRenderer.singbox.readLog({
        search: buildSearchText() || undefined,
        maxResults: MAX_RESULTS
      });
      
      let entries: LogEntry[] = result.lines
        .filter((l) => l != null && String(l).trim().length > 0)
        .map((l) => {
          const parsed = parseLogLine(String(l));
          return {
            id: idCounter.current++,
            time: parsed.time,
            level: parsed.level,
            message: parsed.message,
            configHint: parsed.configHint
          };
        });

      // 后端返回的日志已是从新到旧
      setLogs(entries);
    } catch {
      // 忽略错误
    } finally {
      setIsSearching(false);
    }
  }, [isActive, buildSearchText]);

  // 初始化和非搜索模式下定时刷新
  useEffect(() => {
    if (!isActive) return;
    
    // 立即获取一次
    fetchLogs();
    
    // 非搜索模式且未暂停时，定时刷新
    if (!isInSearchMode && !isPaused) {
      const timer = setInterval(fetchLogs, 2000);
      return () => clearInterval(timer);
    }
  }, [isActive, isInSearchMode, isPaused, fetchLogs]);

  // 搜索模式：防抖后查询
  useEffect(() => {
    if (!isActive || !isInSearchMode) return;
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(fetchLogs, 300);
    
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [isActive, isInSearchMode, searchText, fetchLogs]);

  // 清除日志显示
  const clearLogs = () => {
    setLogs([]);
  };

  const handleOpenMore = (e: React.MouseEvent) => {
    e.stopPropagation();
    const btn = moreButtonRef.current;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.right - 140 });
    }
    setMoreOpen((v) => !v);
  };

  const handleClearKernelLog = async () => {
    setMoreOpen(false);
    const ok = await confirm({
      title: t('logs.clearKernelLog'),
      message: t('logs.clearKernelLogConfirm'),
      confirmText: t('tooltips.confirm'),
      cancelText: t('tooltips.cancel')
    });
    if (!ok) return;
    try {
      const res = await window.ipcRenderer.singbox.clearLog();
      if (res.success) {
        setLogs([]);
        setSearchText('');
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!moreOpen) return;
    const onOutside = () => setMoreOpen(false);
    document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
  }, [moreOpen]);

  // 右键菜单处理
  const handleContextMenu = useCallback((e: React.MouseEvent, log: LogEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      log
    });
    setCopied(false);
  }, []);

  // 关闭右键菜单
  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, []);

  // 复制日志内容
  const handleCopyLog = useCallback(async () => {
    if (!contextMenu.log) return;
    const text = `[${contextMenu.log.time}] [${contextMenu.log.level.toUpperCase()}] ${contextMenu.log.message}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        closeContextMenu();
      }, 800);
    } catch {
      // 忽略错误
    }
  }, [contextMenu.log, closeContextMenu]);

  // 点击其他地方关闭右键菜单
  useEffect(() => {
    if (!contextMenu.visible) return;
    const handleClick = () => closeContextMenu();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu();
    };
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu.visible, closeContextMenu]);

  const getLevelBadgeClass = (level: string) => {
    switch (level.toLowerCase()) {
      case 'info': return 'log-level-info';
      case 'warning': return 'log-level-warning';
      case 'error': return 'log-level-error';
      case 'debug': return 'log-level-debug';
      default: return 'log-level-info';
    }
  };

  return (
    <div className="page-shell min-w-0">
      <div className="page-header" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="min-w-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <h1 className="page-title">{t('logs.title')}</h1>
          <div className="flex items-center gap-2 mt-1.5">
            {/* 状态 */}
            <span className={cn(
              "log-indicator",
              isPaused ? "log-indicator-paused" : (!isPaused && !isInSearchMode) ? "log-indicator-on" : "log-indicator-off"
            )} />
            <span className="text-[12px] text-[var(--app-text-tertiary)]">
              {isPaused ? t('logs.paused') : isInSearchMode ? t('logs.searching') : t('logs.realtime')}
            </span>

            <span className="mx-0.5 h-3 w-px bg-[var(--app-stroke)]" />

            {/* 日志条数 */}
            <span className="text-[12px] text-[var(--app-text-secondary)]">
              {t('logs.logCount')} <Badge tone="accent" className="h-4 px-1.5 text-[10px] font-mono">{totalCount}</Badge>
            </span>

            <span className="mx-0.5 h-3 w-px bg-[var(--app-stroke)]" />

            {/* 操作按钮 */}
            <Button
              onClick={() => setIsPaused(!isPaused)}
              variant="ghost"
              size="sm"
              title={isPaused ? t('logs.continue') : t('logs.pause')}
              disabled={isInSearchMode}
              className="h-6 px-2 text-[10px] gap-1"
            >
              {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              {isPaused ? t('logs.continue') : t('logs.pause')}
            </Button>
            <Button
              onClick={clearLogs}
              variant="ghost"
              size="sm"
              title={t('logs.clear')}
              className="h-6 px-2 text-[10px] gap-1"
            >
              <Trash2 className="w-3 h-3" />
              {t('logs.clear')}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="relative w-52">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--app-text-quaternary)] shrink-0" />
            <Input
              type="text"
              placeholder={t('logs.searchPlaceholder')}
              className="pl-8 text-[12px] pr-8 h-8"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            {(searchText || isSearching) && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {isSearching && (
                  <Loader2 className="w-3 h-3 animate-spin text-[var(--app-text-quaternary)]" />
                )}
                {searchText && (
                  <button
                    onClick={() => setSearchText('')}
                    className="p-0.5 rounded-full hover:bg-[var(--app-hover)] text-[var(--app-text-quaternary)] hover:text-[var(--app-text-secondary)] transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="relative">
            <Button
              ref={moreButtonRef}
              onClick={handleOpenMore}
              variant="ghost"
              size="icon"
              title={t('logs.more')}
              className="h-8 w-8"
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
            {moreOpen &&
              createPortal(
                <div
                  className="fixed bg-[var(--app-bg)] border border-[var(--app-divider)] rounded-lg shadow-lg py-1.5 w-36 z-[200]"
                  style={{ top: dropdownPos.top, left: dropdownPos.left }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="flex items-center px-3 py-1.5 text-[12px] text-[var(--app-text-secondary)] hover:bg-[var(--app-bg-secondary)] hover:text-[var(--app-text)] transition-colors text-left w-full"
                    onClick={handleClearKernelLog}
                  >
                    <FileX2 className="w-3.5 h-3.5 mr-2" />
                    {t('logs.clearKernelLog')}
                  </button>
                </div>,
                document.body
              )}
          </div>
        </div>
      </div>

      <div className="page-content min-w-0 flex flex-col min-h-0 overflow-hidden !px-2 sm:!px-4">
        {/* 列表头 */}
        <div className="log-list-header">
          <div>{t('logs.time')}</div>
          <div>{t('logs.level')}</div>
          <div>{t('logs.message')}</div>
        </div>

        {/* 日志列表 */}
        <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto log-list-scroll">
          {logs.length === 0 && !isSearching ? (
            <div className="log-empty-state">
              <ScrollText className="w-5 h-5 mb-1.5 text-[var(--app-text-quaternary)]" />
              <p className="text-[12px] text-[var(--app-text-quaternary)]">{isInSearchMode ? t('logs.noMatchLogs') : t('logs.noLogs')}</p>
            </div>
          ) : (
            <div className="log-list-body">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="log-list-row group"
                  onContextMenu={(e) => handleContextMenu(e, log)}
                >
                  {/* 时间 */}
                  <div className="log-list-col-time">
                    <span className="log-time">{log.time}</span>
                  </div>

                  {/* 级别 */}
                  <div className="log-list-col-level">
                    <span className={cn("log-level-badge", getLevelBadgeClass(log.level))}>
                      {log.level.toUpperCase()}
                    </span>
                  </div>

                  {/* 消息 */}
                  <div className="log-list-col-message">
                    <span className="log-message">{log.message}</span>
                    {log.configHint && (
                      <span className="log-config-hint">💡 {log.configHint}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 回到顶部按钮 */}
      <button
        onClick={() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = 0;
          }
        }}
        className="floating-action w-[52px] h-[52px]"
        title={t('logs.backToTop')}
      >
        <ArrowUp className="w-5 h-5" />
      </button>

      <ConfirmDialog />

      {/* 右键菜单 */}
      {contextMenu.visible && createPortal(
        <div
          className="fixed bg-[var(--app-bg)] border border-[var(--app-divider)] rounded-lg shadow-lg py-1 w-32 z-[9999]"
          style={{
            top: contextMenu.y,
            left: contextMenu.x
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex items-center px-3 py-1.5 text-[12px] text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors text-left w-full"
            onClick={handleCopyLog}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 mr-2 text-[var(--app-success)]" />
                {t('common.copied')}
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 mr-2" />
                {t('logs.copyLog')}
              </>
            )}
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
