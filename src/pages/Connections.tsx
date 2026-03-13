import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Activity } from 'lucide-react';
import { cn } from '../components/Sidebar';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';
import { Badge, Card } from '../components/ui/Surface';
import { useApi } from '../contexts/ApiContext';
import { getWsUrl, closeConnection, closeAllConnections } from '../services/api';

interface Connection {
  id: string;
  host: string;
  network: string;
  type: string;
  chains: string[];
  rule: string;
  upload: number;
  download: number;
  time: string;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatTime = (start: string) => {
  const diff = Math.floor((Date.now() - new Date(start).getTime()) / 1000);
  if (diff < 0) return '00:00:00';
  const h = Math.floor(diff / 3600).toString().padStart(2, '0');
  const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(diff % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
};

interface ConnectionsProps {
  isActive?: boolean;
}

export function Connections({ isActive = true }: ConnectionsProps) {
  const { apiUrl, apiSecret } = useApi();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [search, setSearch] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // 只有页面激活时才建立 WebSocket 连接
    if (!isActive) {
      return;
    }

    const connectWs = () => {
      try {
        const wsUrl = getWsUrl(apiUrl, '/connections', apiSecret);
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.connections) {
              const mapped = data.connections.map((c: any) => ({
                id: c.id,
                host: c.metadata.host || c.metadata.destinationIP || 'unknown',
                network: c.metadata.network,
                type: c.metadata.type,
                chains: c.chains || [],
                rule: c.rule || '',
                upload: c.upload,
                download: c.download,
                time: formatTime(c.start)
              }));
              setConnections(mapped);
            }
          } catch (e) {
            console.error('Failed to parse connections', e);
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
  }, [apiUrl, apiSecret, isActive]);

  const handleCloseConnection = async (id: string) => {
    try {
      await closeConnection(apiUrl, apiSecret, id);
      setConnections(connections.filter(c => c.id !== id));
    } catch (err) {
      console.error('Failed to close connection', err);
    }
  };

  const handleCloseAll = async () => {
    try {
      await closeAllConnections(apiUrl, apiSecret);
      setConnections([]);
    } catch (err) {
      console.error('Failed to close all connections', err);
    }
  };

  const filteredConnections = connections.filter(c => c.host.includes(search));

  return (
    <div className="page-shell min-w-0">
      <div className="page-header flex-wrap gap-3" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="min-w-0 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <h1 className="page-title">连接</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge tone="accent">{connections.length} 活跃</Badge>
          </div>
        </div>

        <div className="flex items-center gap-2.5 min-w-0 flex-1 sm:flex-initial" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="relative w-full min-w-0 max-w-52">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--app-text-quaternary)] shrink-0" />
            <Input
              type="text"
              placeholder="搜索..."
              className="pl-9 text-[12px] w-full min-w-0"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            onClick={handleCloseAll}
            variant="secondary"
            size="icon"
            title="关闭全部"
            className="shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="page-content min-w-0 px-4 sm:px-6 flex flex-col min-h-0 overflow-hidden">
      <Card className="flex-1 overflow-hidden min-w-0 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--app-divider)] shrink-0">
          <div className="text-[13px] font-medium text-[var(--app-text-secondary)]">实时连接列表</div>
        </div>
        <div className="table-scroll-x flex-1 min-w-0 min-h-0">
          <table className="data-table text-[12px] min-w-[640px]">
          <thead className="sticky top-0 z-10 text-[12px] font-semibold text-[var(--app-text-secondary)] bg-[rgba(255,255,255,0.7)]">
            <tr>
              <th className="px-5 py-2.5">地址</th>
              <th className="px-5 py-2.5">网络</th>
              <th className="px-5 py-2.5">链路</th>
              <th className="px-5 py-2.5">规则</th>
              <th className="px-5 py-2.5 text-right">流量</th>
              <th className="px-5 py-2.5 text-right">时间</th>
              <th className="px-5 py-2.5 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-divider)]">
            {filteredConnections.map((conn) => (
              <tr key={conn.id} className="group">
                <td className="px-5 py-2.5 font-medium text-[var(--app-text)] truncate max-w-[200px]" title={conn.host}>
                  {conn.host}
                </td>
                <td className="px-5 py-2.5">
                  <span className={cn(
                    "badge",
                    conn.network === 'tcp' ? "bg-[rgba(100,116,139,0.12)] text-[var(--app-info)]" : "bg-[var(--app-warning-soft)] text-[var(--app-warning)]"
                  )}>
                    {conn.network}
                  </span>
                </td>
                <td className="px-5 py-2.5">
                  <div className="flex items-center space-x-1 text-[11px] text-[var(--app-text-tertiary)]">
                    {conn.chains.map((chain, i) => (
                      <span key={i} className="flex items-center">
                        {i > 0 && <span className="mx-0.5 text-[var(--app-text-quaternary)]">›</span>}
                        <span className="truncate max-w-[80px]" title={chain}>{chain}</span>
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-2.5 text-[var(--app-text-quaternary)] text-[11px]">{conn.rule}</td>
                <td className="px-5 py-2.5 text-right">
                  <div className="flex flex-col text-[11px] font-mono">
                    <span className="text-[var(--app-success)]">↓ {formatBytes(conn.download)}</span>
                    <span className="text-[var(--app-accent)]">↑ {formatBytes(conn.upload)}</span>
                  </div>
                </td>
                <td className="px-5 py-2.5 text-right text-[var(--app-text-quaternary)] font-mono text-[11px]">{conn.time}</td>
                <td className="px-5 py-2.5 text-center">
                  <Button
                    onClick={() => handleCloseConnection(conn.id)}
                    variant="ghost"
                    size="icon"
                    className="text-[var(--app-text-quaternary)] hover:text-[var(--app-danger)]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {connections.length === 0 && !isConnected && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-[var(--app-text-quaternary)]">
                  <Activity className="w-6 h-6 mx-auto mb-2 text-[var(--app-text-quaternary)]" />
                  <p className="text-[13px]">无活跃连接</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>
      </div>
    </div>
  );
}
