import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Pause, Play, Activity, Search, MoreVertical, FileX2, X, ArrowUp } from 'lucide-react';
import { cn } from '../components/Sidebar';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Field';
import { Badge, Card } from '../components/ui/Surface';
import { useConfirm } from '../components/ui/Notification';

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

// 优化：降低轮询频率，减少内存占用
const POLL_INTERVAL_MS = 2000;
const MAX_DISPLAY_LOGS = 300;

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
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [fromLine, setFromLine] = useState<number | null>(null);
  const idCounter = useRef(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const { confirm, ConfirmDialog } = useConfirm();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 初始化：从后端获取启动时已记录的日志行数
  useEffect(() => {
    if (!isActive) {
      setFromLine(null);
      return;
    }

    const loadInitial = async () => {
      try {
        const { lineCount } = await window.ipcRenderer.singbox.getInitialLogLineCount();
        setFromLine(lineCount);
      } catch {
        setFromLine(0);
      }
    };

    loadInitial();
  }, [isActive]);

  // 轮询读取新日志
  useEffect(() => {
    if (!isActive || isPaused || fromLine === null) return;

    const poll = async () => {
      try {
        const { lines, totalLines } = await window.ipcRenderer.singbox.readLog({ fromLine });
        if (lines.length > 0) {
          const newEntries: LogEntry[] = lines
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
          setFromLine(totalLines);
          setLogs((prev) => {
            const next = [...prev, ...newEntries];
            if (next.length > MAX_DISPLAY_LOGS) return next.slice(next.length - MAX_DISPLAY_LOGS);
            return next;
          });
        } else if (totalLines > fromLine) {
          setFromLine(totalLines);
        }
      } catch {
        // 忽略读取错误
      }
    };

    const timer = setInterval(poll, POLL_INTERVAL_MS);
    poll();

    return () => clearInterval(timer);
  }, [isActive, isPaused, fromLine]);

  const clearLogs = () => setLogs([]);

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
      title: '清理内核日志',
      message: '确定要清空 sing-box 内核日志文件吗？',
      confirmText: '确定',
      cancelText: '取消'
    });
    if (!ok) return;
    try {
      const res = await window.ipcRenderer.singbox.clearLog();
      if (res.success) {
        setLogs([]);
        setFromLine(0);
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

  const getLevelColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'info': return 'text-[var(--app-accent)]';
      case 'warning': return 'text-[var(--app-warning)]';
      case 'error': return 'text-[var(--app-danger)]';
      case 'debug': return 'text-[var(--app-text-quaternary)]';
      default: return 'text-[var(--app-text-secondary)]';
    }
  };

  const getLevelBadgeClass = (level: string) => {
    switch (level.toLowerCase()) {
      case 'info': return 'bg-[var(--app-accent-soft)] text-[var(--app-accent)]';
      case 'warning': return 'bg-[var(--app-warning-soft)] text-[var(--app-warning)]';
      case 'error': return 'bg-[var(--app-danger-soft)] text-[var(--app-danger)]';
      case 'debug': return 'bg-[rgba(100,116,139,0.12)] text-[var(--app-text-quaternary)]';
      default: return 'bg-[rgba(100,116,139,0.12)] text-[var(--app-text-tertiary)]';
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesLevel = levelFilter === 'all' || log.level.toLowerCase() === levelFilter.toLowerCase();
    const matchesSearch = !searchText || log.message.toLowerCase().includes(searchText.toLowerCase());
    return matchesLevel && matchesSearch;
  }).reverse();

  return (
    <div className="page-shell">
      <div className="page-header" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <h1 className="page-title">日志</h1>
        </div>

        <div className="flex items-center gap-2.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="relative w-52">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--app-text-quaternary)]" />
            <Input
              type="text"
              placeholder="搜索消息..."
              className="pl-9 text-[12px] pr-8"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            {searchText && (
              <button
                onClick={() => setSearchText('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-[var(--app-hover)] text-[var(--app-text-quaternary)] hover:text-[var(--app-text-secondary)] transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <Select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="w-28 text-[12px]"
          >
            <option value="all">全部级别</option>
            <option value="info">INFO</option>
            <option value="warning">WARN</option>
            <option value="error">ERROR</option>
            <option value="debug">DEBUG</option>
          </Select>
          <Button
            onClick={() => setIsPaused(!isPaused)}
            variant="ghost"
            size="icon"
            title={isPaused ? "继续" : "暂停"}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </Button>
          <Button
            onClick={clearLogs}
            variant="ghost"
            size="icon"
            title="清除"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <div className="relative">
            <Button
              ref={moreButtonRef}
              onClick={handleOpenMore}
              variant="ghost"
              size="icon"
              title="更多"
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
                    清理内核日志
                  </button>
                </div>,
                document.body
              )}
          </div>
        </div>
      </div>

      <div className="page-content min-w-0 flex flex-col min-h-0 overflow-hidden">
      <Card className="flex-1 overflow-hidden min-w-0 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--app-divider)]">
          <div className="text-[13px] font-medium text-[var(--app-text-secondary)]">内核日志列表</div>
          <Badge tone={isPaused ? 'warning' : 'success'}>{isPaused ? '已暂停' : '实时'}</Badge>
        </div>
        <div ref={scrollContainerRef} className="table-scroll-x flex-1 min-h-0 overflow-y-auto">
          <table className="data-table text-[12px] min-w-full">
          <thead className="sticky top-0 z-10 text-[12px] font-semibold text-[var(--app-text-secondary)] !bg-[rgba(255,255,255,0.9)]">
            <tr>
              <th className="px-5 py-2.5 w-32">时间</th>
              <th className="px-5 py-2.5 w-28">级别</th>
              <th className="px-5 py-2.5">消息</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-divider)]">
            {filteredLogs.map((log) => (
              <tr key={log.id} className="group">
                <td className="px-5 py-2.5 font-mono text-[var(--app-text-quaternary)] text-[11px]">
                  {log.time}
                </td>
                <td className="px-5 py-2.5">
                  <span className={cn("badge", getLevelBadgeClass(log.level))}>
                    {log.level.toUpperCase()}
                  </span>
                </td>
                <td className="px-5 py-2.5 text-[var(--app-text-secondary)] break-all font-mono text-[11px]">
                  <div>
                    {log.message}
                    {log.configHint && (
                      <p className="mt-1 text-[11px] text-[var(--app-warning)] bg-[var(--app-warning-soft)] px-2 py-1 rounded">
                        💡 {log.configHint}
                      </p>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-10 text-center text-[var(--app-text-quaternary)]">
                  <Activity className="w-6 h-6 mx-auto mb-2 text-[var(--app-text-quaternary)]" />
                  <p className="text-[13px]">暂无日志</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>
      </div>
      <button
        onClick={() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = 0;
          }
        }}
        className="floating-action w-[52px] h-[52px]"
        title="返回顶部"
      >
        <ArrowUp className="w-5 h-5" />
      </button>
      <ConfirmDialog />
    </div>
  );
}
