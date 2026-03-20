import * as React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../Sidebar';

export interface ModalProps {
  /** 是否显示 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 标题 */
  title: React.ReactNode;
  /** 子内容 */
  children: React.ReactNode;
  /** 最大宽度类名，如 max-w-lg, max-w-2xl */
  maxWidth?: string;
  /** 内容区额外类名 */
  contentClassName?: string;
  /** 是否显示头部（含标题和关闭按钮） */
  showHeader?: boolean;
  /** 底部操作区 */
  footer?: React.ReactNode;
  /** z-index，默认 200 */
  zIndex?: number;
}

/**
 * 通用弹窗组件
 * 确保关闭按钮可用：z-index 分层、WebkitAppRegion、原生 button
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
  contentClassName,
  showHeader = true,
  footer,
  zIndex = 200,
}: ModalProps) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="flex items-center justify-center p-4"
          style={{ position: 'fixed', inset: 0, zIndex }}
        >
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
            className={cn(
              'relative z-10 w-full flex flex-col bg-white border border-[rgba(39,44,54,0.08)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden',
              maxWidth
            )}
            style={{ maxHeight: 'calc(100vh - 2rem)', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onClick={(e) => e.stopPropagation()}
          >
            {showHeader && (
              <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/50">
                <h2 className="text-[15px] font-semibold text-[var(--app-text)]">{title}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                  aria-label="关闭"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className={cn('flex-1 overflow-y-auto', contentClassName)}>{children}</div>
            {footer && (
              <div className="flex shrink-0 items-center justify-end gap-2 px-6 py-4 border-t border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/30">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
