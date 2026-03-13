import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Pause, Play, Activity, Search } from 'lucide-react';
import { cn } from '../components/Sidebar';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Field';
import { Badge, Card } from '../components/ui/Surface';
import { useApi } from '../contexts/ApiContext';
import { getWsUrl } from '../services/api';

interface LogEntry {
  id: number;
  time: string;
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
}

interface LogsProps {
  isActive?: boolean;
}

export function Logs({ isActive = true }: LogsProps) {
  const { apiUrl, apiSecret } = useApi();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const idCounter = useRef(0);

  useEffect(() => {
    // 只有页面激活时才建立 WebSocket 连接
    if (!isActive) {
      return;
    }

    const connectWs = () => {
      try {
        const wsUrl = getWsUrl(apiUrl, '/logs?level=info', apiSecret);
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          if (isPaused) return;
          try {
            const data = JSON.parse(event.data);
            const newLog: LogEntry = {
              id: idCounter.current++,
              time: new Date().toLocaleTimeString('en-US', { hour12: false }),
              level: data.type || 'info',
              message: data.payload || ''
            };

            setLogs(prev => {
              const newLogs = [...prev, newLog];
              if (newLogs.length > 500) return newLogs.slice(newLogs.length - 500);
              return newLogs;
            });
          } catch (e) {
            console.error('Failed to parse log message', e);
          }
        };

        ws.onerror = () => {
          setIsConnected(false);
        };

        ws.onclose = () => {
          setIsConnected(false);
          setTimeout(connectWs, 5000);
        };

        wsRef.current = ws;
      } catch (err: any) {
        setIsConnected(false);
      }
    };

    connectWs();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [apiUrl, apiSecret, isPaused, isActive]);

  useEffect(() => {
    // 不再自动滚动，因为最新日志在上面
  }, [logs, isPaused]);

  const clearLogs = () => setLogs([]);

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
              className="pl-9 text-[12px]"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <Select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="w-28 text-[12px]"
          >
            <option value="all">全部级别</option>
            <option value="info">INFO</option>
            <option value="warning">WARNING</option>
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
        </div>
      </div>

      <div className="page-content">
      <Card className="flex-1 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--app-divider)]">
          <div className="text-[13px] font-medium text-[var(--app-text-secondary)]">实时日志流</div>
          <Badge tone={isPaused ? 'warning' : 'success'}>{isPaused ? '已暂停' : '实时'}</Badge>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="data-table text-[12px]">
          <thead className="sticky top-0 z-10 text-[11px] uppercase">
            <tr>
              <th className="px-5 py-2.5 font-medium w-32">时间</th>
              <th className="px-5 py-2.5 font-medium w-28">级别</th>
              <th className="px-5 py-2.5 font-medium">消息</th>
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
                  {log.message}
                </td>
              </tr>
            ))}
            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-10 text-center text-[var(--app-text-quaternary)]">
                  <Activity className="w-6 h-6 mx-auto mb-2 text-[var(--app-text-quaternary)]" />
                  <p className="text-[13px]">
                    {!isConnected
                      ? '正在连接...'
                      : '暂无日志（请确保内核已启动，并在设置中启用日志级别）'}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
          <div ref={logsEndRef} />
        </div>
      </Card>
      </div>
    </div>
  );
}
