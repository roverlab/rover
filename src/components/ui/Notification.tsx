import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertCircle, X, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface NotificationItem {
    id: number;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
}

interface NotificationContextType {
    notifications: NotificationItem[];
    addNotification: (message: string, type?: NotificationItem['type']) => void;
    removeNotification: (id: number) => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function useNotification() {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
}

interface NotificationProviderProps {
    children: ReactNode;
}

let notificationIdCounter = 0;

export function NotificationProvider({ children }: NotificationProviderProps) {
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);

    const addNotification = useCallback((message: string, type: NotificationItem['type'] = 'success') => {
        const id = Date.now() * 1000 + (notificationIdCounter++ % 1000);
        setNotifications(prev => [...prev, { message, type, id }]);
        
        // 自动移除，默认3秒
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 3000);
    }, []);

    const removeNotification = useCallback((id: number) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    return (
        <NotificationContext.Provider value={{ notifications, addNotification, removeNotification }}>
            {children}
            <NotificationContainer 
                notifications={notifications} 
                removeNotification={removeNotification} 
            />
        </NotificationContext.Provider>
    );
}

interface NotificationContainerProps {
    notifications: NotificationItem[];
    removeNotification: (id: number) => void;
}

function NotificationContainer({ notifications, removeNotification }: NotificationContainerProps) {
    if (notifications.length === 0) return null;

    return createPortal(
        <div className="fixed inset-x-0 top-10 z-[9999] flex flex-col items-center gap-2 pointer-events-auto">
            <AnimatePresence>
                {notifications.map(n => (
                    <motion.div
                        key={n.id}
                        initial={{ opacity: 0, x: 20, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 20, scale: 0.95 }}
                        className={cn(
                            "px-3.5 py-2.5 rounded-lg shadow-sm flex items-center space-x-2.5 text-[13px] font-medium min-w-[180px] max-w-[360px] border bg-background",
                            n.type === 'success' && "border-green-200 text-foreground",
                            n.type === 'error' && "border-destructive/30 text-foreground",
                            n.type === 'info' && "border-blue-200 text-foreground",
                            n.type === 'warning' && "border-yellow-200 text-foreground"
                        )}
                    >
                        {n.type === 'success' && (
                            <CheckCircle className="w-4 h-4 text-[var(--app-success)] shrink-0" />
                        )}
                        {n.type === 'error' && (
                            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                        )}
                        {n.type === 'info' && (
                            <AlertCircle className="w-4 h-4 text-blue-500 shrink-0" />
                        )}
                        {n.type === 'warning' && (
                            <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0" />
                        )}
                        <span className="flex-1 break-words">{n.message}</span>
                        <button 
                            onClick={() => removeNotification(n.id)}
                            className="shrink-0 p-0.5 hover:bg-accent rounded transition-colors"
                        >
                            <X className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>,
        document.body
    );
}

// 导出一个简单的 hook，用于向后兼容
export function useNotificationState() {
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);

    const addNotification = useCallback((message: string, type: NotificationItem['type'] = 'success') => {
        const id = Date.now() * 1000 + (notificationIdCounter++ % 1000);
        setNotifications(prev => [...prev, { message, type, id }]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 3000);
    }, []);

    const removeNotification = useCallback((id: number) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    return { notifications, addNotification, removeNotification };
}

// 导出独立的通知容器组件，用于需要本地状态管理的场景
export function NotificationList({ 
    notifications, 
    onRemove 
}: { 
    notifications: NotificationItem[];
    onRemove: (id: number) => void;
}) {
    if (notifications.length === 0) return null;

    return createPortal(
        <div className="fixed inset-x-0 top-10 z-[9999] flex flex-col items-center gap-2 pointer-events-auto">
            <AnimatePresence>
                {notifications.map(n => (
                    <motion.div
                        key={n.id}
                        initial={{ opacity: 0, x: 20, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 20, scale: 0.95 }}
                        className={cn(
                            "px-3.5 py-2.5 rounded-lg shadow-sm flex items-center space-x-2.5 text-[13px] font-medium min-w-[180px] max-w-[360px] border bg-background",
                            n.type === 'success' && "border-green-200 text-foreground",
                            n.type === 'error' && "border-destructive/30 text-foreground",
                            n.type === 'info' && "border-blue-200 text-foreground",
                            n.type === 'warning' && "border-yellow-200 text-foreground"
                        )}
                    >
                        {n.type === 'success' && (
                            <CheckCircle className="w-4 h-4 text-[var(--app-success)] shrink-0" />
                        )}
                        {n.type === 'error' && (
                            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                        )}
                        {n.type === 'info' && (
                            <AlertCircle className="w-4 h-4 text-blue-500 shrink-0" />
                        )}
                        {n.type === 'warning' && (
                            <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0" />
                        )}
                        <span className="flex-1 break-words">{n.message}</span>
                        {onRemove && (
                            <button 
                                onClick={() => onRemove(n.id)}
                                className="shrink-0 p-0.5 hover:bg-accent rounded transition-colors"
                            >
                                <X className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                        )}
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>,
        document.body
    );
}

// ==================== 确认对话框 ====================

interface ConfirmOptions {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
}

interface ConfirmState extends ConfirmOptions {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

// 确认对话框组件
function ConfirmDialog({ 
    isOpen, 
    title, 
    message, 
    confirmText = '确定', 
    cancelText = '取消',
    variant = 'warning',
    onConfirm, 
    onCancel 
}: ConfirmState) {
    // 打开时阻止 body 滚动，避免跳动
    useEffect(() => {
        if (isOpen) {
            const originalOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = originalOverflow;
            };
        }
    }, [isOpen]);

    return createPortal(
        <AnimatePresence>
            {isOpen && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-auto">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="absolute inset-0 z-0 bg-black/40 backdrop-blur-sm"
                    onClick={onCancel}
                />
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ duration: 0.15 }}
                    className="relative z-10 w-full max-w-sm bg-background border border-border rounded-lg shadow-lg overflow-hidden"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="p-6">
                        <div className="flex items-center gap-3 mb-3">
                            <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center",
                                variant === 'danger' && "bg-destructive/10",
                                variant === 'warning' && "bg-[var(--app-warning-soft)]",
                                variant === 'info' && "bg-[var(--app-info-soft)]"
                            )}>
                                <AlertTriangle className={cn(
                                    "w-5 h-5",
                                    variant === 'danger' && "text-destructive",
                                    variant === 'warning' && "text-[var(--app-warning)]",
                                    variant === 'info' && "text-blue-500"
                                )} />
                            </div>
                            <h3 className="text-[15px] font-semibold text-foreground">
                                {title || '确认操作'}
                            </h3>
                        </div>
                        <p className="text-[13px] text-muted-foreground leading-relaxed pl-[52px]">
                            {message}
                        </p>
                    </div>
                    <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-muted/30">
                        <button
                            onClick={onCancel}
                            className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={onConfirm}
                            className={cn(
                                "px-4 py-2 text-[13px] font-medium text-primary-foreground rounded-md transition-colors",
                                variant === 'danger' && "bg-destructive hover:bg-destructive/90",
                                variant === 'warning' && "bg-yellow-500 hover:bg-yellow-600",
                                variant === 'info' && "bg-primary hover:bg-primary/90"
                            )}
                        >
                            {confirmText}
                        </button>
                    </div>
                </motion.div>
            </div>
            )}
        </AnimatePresence>,
        document.body
    );
}

// useConfirm hook - 用于函数式调用确认对话框
export function useConfirm() {
    const [confirmState, setConfirmState] = useState<ConfirmState>({
        isOpen: false,
        message: '',
        onConfirm: () => {},
        onCancel: () => {},
    });

    const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            setConfirmState({
                ...options,
                isOpen: true,
                onConfirm: () => {
                    setConfirmState(prev => ({ ...prev, isOpen: false }));
                    resolve(true);
                },
                onCancel: () => {
                    setConfirmState(prev => ({ ...prev, isOpen: false }));
                    resolve(false);
                },
            });
        });
    }, []);

    const ConfirmDialogComponent = () => (
        <ConfirmDialog {...confirmState} />
    );

    return { confirm, ConfirmDialog: ConfirmDialogComponent };
}
