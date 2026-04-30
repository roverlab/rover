import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2 } from 'lucide-react';

interface DnsServerRowDropdownProps {
    server: any;
    position: { top: number; left: number };
    onEdit: (server: any) => void;
    onDelete: (server: any) => void;
}

export function DnsServerRowDropdown({
    server,
    position,
    onEdit,
    onDelete,
}: DnsServerRowDropdownProps) {
    const { t } = useTranslation();
    return createPortal(
        <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -5 }}
            transition={{ duration: 0.15 }}
            className="dropdown-menu fixed z-[200] flex w-30 flex-col overflow-hidden rounded-[12px] border border-[var(--app-stroke)] bg-[var(--app-panel)] py-1.5 shadow-[0_12px_24px_rgba(15,23,42,0.12)]"
            style={{ top: position.top, left: position.left }}
            onClick={(e) => e.stopPropagation()}
        >
            <button
                className="flex items-center px-3 py-1.5 text-[12px] text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors text-left w-full"
                onClick={() => onEdit(server)}
            >
                <Pencil className="w-3.5 h-3.5 mr-2" />
                {t('dnsServersTab.edit')}
            </button>
            <div className="mx-2 my-1 border-t border-[var(--app-divider)]" />
            <button
                className="flex items-center px-3 py-1.5 text-[12px] text-[var(--app-danger)] hover:bg-[var(--app-danger-soft)] transition-colors text-left w-full"
                onClick={() => onDelete(server)}
            >
                <Trash2 className="w-3.5 h-3.5 mr-2" />
                {t('dnsServersTab.delete')}
            </button>
        </motion.div>,
        document.body
    );
}
