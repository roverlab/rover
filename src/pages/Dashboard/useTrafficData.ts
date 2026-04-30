import { useState, useEffect } from 'react';
import { getWsUrl } from '../../services/api';

interface TrafficData {
    up: number;
    down: number;
    time: number;
}

// 自定义Hook用于管理流量数据
// pauseConnections: 切换 TUN/内核操作时暂停连接，避免重连干扰端口释放
export function useTrafficData(isRunning: boolean, apiUrl: string, apiSecret: string, pauseConnections: boolean) {
    const [currentTraffic, setCurrentTraffic] = useState({ up: 0, down: 0 });
    const [totalTraffic, setTotalTraffic] = useState({ up: 0, down: 0 });
    const [trafficHistory, setTrafficHistory] = useState<TrafficData[]>([]);

    useEffect(() => {
        // 页面不激活时不建立连接
        if (!isRunning || !apiUrl || pauseConnections) {
            setCurrentTraffic({ up: 0, down: 0 });
            return;
        }

        let cancelled = false;
        let ws: WebSocket;
        let lastUpdate = 0;
        const DEBOUNCE_MS = 200;
        let reconnectTimeout: NodeJS.Timeout;
        const MAX_RECONNECT_DELAY = 10000;
        let reconnectAttempts = 0;

        const connectWs = () => {
            if (cancelled) return;
            const url = getWsUrl(apiUrl, '/traffic', apiSecret);
            ws = new WebSocket(url);

            ws.onmessage = (event) => {
                try {
                    const now = Date.now();
                    const data = JSON.parse(event.data);
                    
                    // 更新当前流量（实时性要求高）
                    setCurrentTraffic({ up: data.up, down: data.down });
                    
                    // 累计总流量和历史数据去抖处理
                    if (now - lastUpdate >= DEBOUNCE_MS) {
                        setTotalTraffic(prev => ({ 
                            up: prev.up + data.up, 
                            down: prev.down + data.down 
                        }));
                        
                        setTrafficHistory(prev => {
                            const next = [...prev, { up: data.up, down: data.down, time: now }];
                            // 优化：减少历史数据点数量，降低内存占用
                            if (next.length > 40) next.shift();
                            return next;
                        });
                        lastUpdate = now;
                        reconnectAttempts = 0; // 重置重连计数器
                    }
                } catch (e) {
                    console.warn('[Traffic] WebSocket message parse failed:', e);
                }
            };

            ws.onerror = () => {
                console.warn('[Traffic] WebSocket connection error');
                ws.close();
            };
            
            ws.onclose = () => {
                console.log('[Traffic] WebSocket connection closed');
                if (cancelled) return;
                if (isRunning && !pauseConnections) {
                    // 指数退避重连策略
                    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
                    reconnectAttempts++;
                    console.log(`[Traffic] Reconnecting in ${delay}ms, attempt ${reconnectAttempts}`);
                    reconnectTimeout = setTimeout(connectWs, delay);
                }
            };
        };

        connectWs();
        
        return () => {
            cancelled = true;
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            if (ws) ws.close();
        };
    // 注意：isActive 检查在调用方 useTrafficData 的参数中处理
    // 当 Dashboard 不激活时，pauseConnections 会被设为 true
    }, [isRunning, apiUrl, apiSecret, pauseConnections]);

    return { currentTraffic, totalTraffic, trafficHistory };
}
