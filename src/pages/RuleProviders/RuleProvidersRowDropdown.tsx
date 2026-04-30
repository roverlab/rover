import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Eye, Edit2, Trash2 } from 'lucide-react';
import type { RuleProvider } from '../../types/rule-providers';

interface RuleProviderRowDropdownProps {
    provider: RuleProvider;
    position: { top: number; left: number };
    onView: (provider: RuleProvider) => void;
    onEdit: (provider: RuleProvider) => void;
    onDelete: (id: string) => void;
}

export function RuleProviderRowDropdown({
    provider,
    position,
    onView,
    onEdit,
    onDelete,
}: RuleProviderRowDropdownProps) {
    const { t } = useTranslation();
    return createPortal(
        <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -5 }}
            transition={{ duration: 0.15 }}
            className="dropdown-menu fixed z-[200] flex w-30 flex-col overflow-hidden rounded-[12px] border border-[var(--app-stroke)] bg-[var(--app-panel)] py-1.5 shadow-[var(--shadow-elevated)]"
            style={{ top: position.top, left: position.left }}
            onClick={(e) => e.stopPropagation()}
        >
            <button
                className="flex items-center px-3 py-1.5 text-[12px] text-[var(--app-text-secondary)] hover:bg-[var(--app-bg-secondary)] hover:text-[var(--app-text)] transition-colors text-left w-full"
                onClick={() => onView(provider)}
            >
                <Eye className="w-3.5 h-3.5 mr-2" />
                {t('ruleProviders.view')}
            </button>
            <button
                className="flex items-center px-3 py-1.5 text-[12px] text-[var(--app-text-secondary)] hover:bg-[var(--app-bg-secondary)] hover:text-[var(--app-text)] transition-colors text-left w-full"
                onClick={() => onEdit(provider)}
            >
                <Edit2 className="w-3.5 h-3.5 mr-2" />
                {t('ruleProviders.edit')}
            </button>
            <div className="mx-2 my-1 border-t border-[var(--app-divider)]" />
            <button
                className="flex items-center px-3 py-1.5 text-[12px] text-[var(--app-danger)] hover:bg-[var(--app-danger-soft)] transition-colors text-left"
                onClick={() => onDelete(provider.id)}
            >
                <Trash2 className="w-3.5 h-3.5 mr-2" />
                {t('ruleProviders.delete')}
            </button>
        </motion.div>,
        document.body
    );
}
