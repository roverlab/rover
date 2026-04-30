import * as React from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "../../lib/utils"

export interface ModalProps {
  /** 是否显示 */
  open: boolean
  /** 关闭回调 */
  onClose: () => void
  /** 标题 */
  title: React.ReactNode
  /** 子内容 */
  children: React.ReactNode
  /** 最大宽度类名，如 max-w-lg, max-w-2xl */
  maxWidth?: string
  /** 内容区额外类名 */
  contentClassName?: string
  /** 是否显示头部（含标题和关闭按钮） */
  showHeader?: boolean
  /** 底部操作区 */
  footer?: React.ReactNode
  /** z-index，默认 200 */
  zIndex?: number
}

/**
 * 通用弹窗组件 - Shadcn UI 风格
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-lg",
  contentClassName,
  showHeader = true,
  footer,
  zIndex = 200,
}: ModalProps) {
  const { t } = useTranslation()
  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="flex items-center justify-center p-4"
          style={{ position: "fixed", inset: 0, zIndex }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-0 bg-black/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className={cn(
              "relative z-10 w-full flex flex-col bg-background border border-border rounded-lg shadow-lg overflow-hidden",
              maxWidth
            )}
            style={{ maxHeight: "calc(100vh - 2rem)", WebkitAppRegion: "no-drag" } as React.CSSProperties}
            onClick={(e) => e.stopPropagation()}
          >
            {showHeader && (
              <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">{title}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors -mr-2"
                  aria-label={t("common.close")}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className={cn("flex-1 overflow-y-auto", contentClassName)}>{children}</div>
            {footer && (
              <div className="flex shrink-0 items-center justify-end gap-2 px-6 py-4 border-t border-border bg-muted/30">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}
