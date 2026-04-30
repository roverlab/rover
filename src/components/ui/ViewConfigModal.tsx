import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

interface ViewConfigModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  content: string;
  loading?: boolean;
}

export function ViewConfigModal({ open, onClose, title, content, loading = false }: ViewConfigModalProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
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
            className="relative z-10 w-full max-w-3xl h-[80vh] flex flex-col bg-[var(--app-panel)] border border-[var(--app-stroke)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/50">
              <h2 className="text-[15px] font-semibold text-[var(--app-text)]">{title}</h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={loading || !content}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={t('common.copy')}
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                  aria-label={t('common.close')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 p-0 relative bg-[var(--app-bg-secondary)]/20">
              {loading ? (
                <div className="flex items-center justify-center h-full text-[var(--app-text-tertiary)]">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  {t('common.loading')}
                </div>
              ) : (
                <textarea
                  value={content}
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
  );
}
