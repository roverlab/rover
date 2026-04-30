import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Eye, Edit2, Trash2 } from 'lucide-react';
import type { DnsPolicy } from '../../types/dns-policy';

interface DnsPolicyRowDropdownProps {
    policy: DnsPolicy;
    position: { top: number; left: number };
    onViewDetail: (policy: DnsPolicy) => void;
    onEdit: (policy: DnsPolicy) => void;
    onDelete: (id: string, name: string) => void;
}

export function DnsPolicyRowDropdown({
    policy,
    position,
    onViewDetail,
    onEdit,
    onDelete,
}: DnsPolicyRowDropdownProps) {
    const { t } = useTranslation();
    return createPortal(
        <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -5 }}
            transition={{ duration: 0.15 }}
            className="dropdown-menu fixed z-[200] flex w-30 flex-col overflow-hidden rounded-[12px] border border-[var(--app-stroke)] bg-[var(--app-panel)] py-1 shadow-[0_12px_24px_rgba(15,23,42,0.12)]"
            style={{ top: position.top, left: position.left }}
            onClick={(e) => e.stopPropagation()}
        >
            <button
                className="flex items-center px-3 py-1.5 text-[12px] text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] text-left"
                onClick={() => onViewDetail(policy)}
            >
                <Eye className="w-3.5 h-3.5 mr-2" />{t('policies.rowViewDetail')}
            </button>
            <button
                className="flex items-center px-3 py-1.5 text-[12px] text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] text-left"
                onClick={() => onEdit(policy)}
            >
                <Edit2 className="w-3.5 h-3.5 mr-2" />{t('policies.rowEdit')}
            </button>
            <div className="mx-2 my-1 border-t border-[var(--app-divider)]" />
            <button
                className="flex items-center px-3 py-1.5 text-[12px] text-[var(--app-danger)] hover:bg-[var(--app-danger-soft)] text-left"
                onClick={() => onDelete(policy.id, policy.name)}
            >
                <Trash2 className="w-3.5 h-3.5 mr-2" />{t('policies.rowDelete')}
            </button>
        </motion.div>,
        document.body
    );
}
