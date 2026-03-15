import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Eye, Edit2, Trash2 } from 'lucide-react';
import type { Policy } from '../../types/policy';

interface PolicyRowDropdownProps {
    policy: Policy;
    position: { top: number; left: number };
    onViewDetail: (policy: Policy) => void;
    onEdit: (policy: Policy) => void;
    onDelete: (id: string, name: string) => void;
}

export function PolicyRowDropdown({
    policy,
    position,
    onViewDetail,
    onEdit,
    onDelete,
}: PolicyRowDropdownProps) {
    return createPortal(
        <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -5 }}
            transition={{ duration: 0.15 }}
            className="dropdown-menu fixed z-[200] flex w-30 flex-col overflow-hidden rounded-[12px] border border-[rgba(39,44,54,0.08)] bg-white py-1 shadow-[0_12px_24px_rgba(15,23,42,0.12)]"
            style={{ top: position.top, left: position.left }}
            onClick={(e) => e.stopPropagation()}
        >
            <button
                className="flex items-center px-3 py-1.5 text-[12px] text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] text-left"
                onClick={() => onViewDetail(policy)}
            >
                <Eye className="w-3.5 h-3.5 mr-2" />查看详情
            </button>
            <button
                className="flex items-center px-3 py-1.5 text-[12px] text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] text-left"
                onClick={() => onEdit(policy)}
            >
                <Edit2 className="w-3.5 h-3.5 mr-2" />编辑
            </button>
            <div className="mx-2 my-1 border-t border-[rgba(39,44,54,0.06)]" />
            <button
                className="flex items-center px-3 py-1.5 text-[12px] text-red-500 hover:bg-red-50 text-left"
                onClick={() => onDelete(policy.id, policy.name)}
            >
                <Trash2 className="w-3.5 h-3.5 mr-2" />删除
            </button>
        </motion.div>,
        document.body
    );
}
