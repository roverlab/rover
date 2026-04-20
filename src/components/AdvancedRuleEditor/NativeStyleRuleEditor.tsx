import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { GripVertical, Search, ChevronDown } from 'lucide-react';
import Sortable from 'sortablejs';
import type { RuleTreeNode, LogicGroup, LeafRule } from './types';
import type { RuleFieldConfig } from './types';

const LOGIC_TYPES = ['all', 'any', 'not'];

/** 规则字段是否匹配搜索词（支持中文、formKey、singboxKey） */
function fieldMatchesSearch(field: RuleFieldConfig, q: string, t: (key: string) => string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const label = t(field.label).toLowerCase();
  const formKey = field.formKey.toLowerCase();
  const singboxKey = (field.singboxKey ?? field.formKey).toLowerCase();
  return label.includes(s) || formKey.includes(s) || singboxKey.includes(s);
}

interface SearchableFieldSelectProps {
  value: string;
  fields: RuleFieldConfig[];
  onChange: (formKey: string) => void;
  onConvertToGroup: () => void;
  className?: string;
}

function SearchableFieldSelect({
  value,
  fields,
  onChange,
  onConvertToGroup,
  className = '',
}: SearchableFieldSelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const safeFields = fields || [];
  const selectedField = safeFields.find(f => f.formKey === value) || safeFields[0];
  const filtered = safeFields.filter(f => fieldMatchesSearch(f, search, t));

  // 打开时计算下拉位置，使用 fixed 避免被父级 overflow 裁剪
  useEffect(() => {
    if (!open || !containerRef.current) return;
    const DROPDOWN_MAX_H = 280;
    const GAP = 4;
    const updatePosition = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - GAP;
      const showAbove = spaceBelow < DROPDOWN_MAX_H && rect.top > spaceBelow;
      setDropdownRect({
        top: showAbove ? rect.top - DROPDOWN_MAX_H - GAP : rect.bottom + GAP,
        left: rect.left,
      });
    };
    updatePosition();
    const ro = new ResizeObserver(updatePosition);
    ro.observe(containerRef.current);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const dropdownContent = open && dropdownRect && (
    <div
      ref={dropdownRef}
      className="fixed z-[9999] min-w-[220px] max-h-[280px] flex flex-col bg-[var(--app-panel)] rounded-[10px] border border-[var(--app-stroke-strong)] shadow-[var(--shadow-panel)] overflow-hidden"
      style={{ top: dropdownRect.top, left: dropdownRect.left }}
    >
      <div className="p-2 border-b border-[var(--app-divider)]">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-[var(--app-panel-soft)] rounded-[10px] border border-[var(--app-stroke)] focus-within:border-[var(--app-accent-border)] transition">
          <Search className="w-3.5 h-3.5 text-[var(--app-text-quaternary)] shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('advancedRuleEditor.searchFieldsPlaceholder')}
            className="flex-1 min-w-0 text-[12px] bg-transparent outline-none focus:ring-0 placeholder:text-[var(--app-text-quaternary)]"
            autoFocus
          />
        </div>
      </div>
      <div className="overflow-y-auto max-h-[200px] py-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-[12px] text-[var(--app-text-quaternary)] text-center">{t('advancedRuleEditor.noMatchingFields')}</div>
        ) : (
          filtered.map(field => (
            <button
              key={field.key}
              type="button"
              onClick={() => {
                onChange(field.formKey);
                setOpen(false);
                setSearch('');
              }}
              className={`w-full text-left px-3 py-2 text-[12px] hover:bg-[var(--app-hover)] transition-colors flex items-center justify-between gap-2 ${
                value === field.formKey ? 'bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)] font-medium' : 'text-[var(--app-text)]'
              }`}
            >
              <span>{t(field.label)}</span>
              {field.singboxKey && (
                <span className="text-[10px] text-[var(--app-text-quaternary)] font-mono truncate max-w-[100px]">{field.singboxKey}</span>
              )}
            </button>
          ))
        )}
      </div>
      <div className="border-t border-[var(--app-divider)] p-1">
        <button
          type="button"
          onClick={() => {
            onConvertToGroup();
            setOpen(false);
          }}
          className="w-full px-3 py-2 text-[12px] text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] rounded-[10px] transition-colors"
        >
          {t('advancedRuleEditor.convertToGroup')}
        </button>
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 text-[12px] font-medium text-[var(--app-text-secondary)] bg-[var(--app-panel-soft)] px-3 py-1.5 rounded-[10px] outline-none border border-[var(--app-stroke)] hover:border-[var(--app-stroke-strong)] min-w-[140px] transition"
      >
        <span className="truncate">{selectedField ? t(selectedField.label) : value}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-[var(--app-text-quaternary)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {dropdownContent && createPortal(dropdownContent, document.body)}
    </div>
  );
}

interface NativeStyleRuleEditorProps {
  node: RuleTreeNode;
  path: string;
  onNodeChange: (path: string, newNode: RuleTreeNode) => void;
  onRemoveNode?: (path: string) => void;
  stringFields: RuleFieldConfig[];
  isRoot?: boolean;
}


export function NativeStyleRuleEditor({
  node,
  path,
  onNodeChange,
  onRemoveNode,
  stringFields,
  isRoot = false,
}: NativeStyleRuleEditorProps) {
  const { t } = useTranslation();
  const [isFolded, setIsFolded] = useState(false);
  const sortableRef = useRef<HTMLDivElement>(null);
  const sortableInstance = useRef<Sortable | null>(null);
  const isGroup = 'rules' in node && Array.isArray(node.rules);
  const safeStringFields = stringFields || [];

  // 使用ref保存最新的回调函数，避免useEffect频繁重新运行
  const callbacksRef = useRef({ onNodeChange, node });
  useEffect(() => {
    callbacksRef.current = { onNodeChange, node };
  }, [onNodeChange, node]);

  // 初始化拖拽排序
  useEffect(() => {
    if (!sortableRef.current || !isGroup) return;
    
    sortableInstance.current = Sortable.create(sortableRef.current, {
      group: 'rules',
      animation: 200,
      handle: '.sortable-handle',
      preventOnFilter: false,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      onMove: (evt) => {
        // 允许所有移动
        return true;
      },
      onEnd: (evt) => {
        if (evt.from === evt.to && evt.oldIndex === evt.newIndex) return;
        
        const fromIdx = evt.oldIndex ?? 0;
        const toIdx = evt.newIndex ?? 0;
        const currentNode = callbacksRef.current.node as LogicGroup;
        
        // 重新排序规则
        const newRules = [...currentNode.rules];
        const [movedItem] = newRules.splice(fromIdx, 1);
        newRules.splice(toIdx, 0, movedItem);
        
        const newNode = { ...currentNode, rules: newRules };
        callbacksRef.current.onNodeChange(path, newNode);
      },
    });
    
    return () => {
      sortableInstance.current?.destroy();
      sortableInstance.current = null;
    };
  }, [isGroup, path]);

  const handleToggleFold = (e: React.MouseEvent) => {
    // 防止点击下拉框或按钮时触发折叠
    if ((e.target as HTMLElement).closest('select') || (e.target as HTMLElement).closest('button')) {
      return;
    }
    setIsFolded(!isFolded);
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>, nodePath: string) => {
    e.stopPropagation();
    const newType = e.target.value;

    if (LOGIC_TYPES.includes(newType)) {
      const newNode: LogicGroup = {
        id: crypto.randomUUID(),
        type: newType as 'all' | 'any' | 'not',
        rules: 'rules' in node ? (node as LogicGroup).rules : [],
      };
      onNodeChange(nodePath, newNode);
    } else {
      const newNode: LeafRule = {
        id: crypto.randomUUID(),
        type: newType,
        value: 'value' in node ? (node as LeafRule).value : '',
      };
      onNodeChange(nodePath, newNode);
    }
  };

  const handleValueChange = (nodePath: string, value: string) => {
    const leafNode = node as LeafRule;
    const newNode: LeafRule = { ...leafNode, value };
    onNodeChange(nodePath, newNode);
  };

  const handleAddRule = (nodePath: string) => {
    if (!isGroup) return;
    const groupNode = node as LogicGroup;
    const newRule: LeafRule = { 
      id: crypto.randomUUID(),
      type: 'domain', 
      value: '' 
    };
    const newRules = [...groupNode.rules, newRule];
    const newNode: LogicGroup = { ...groupNode, rules: newRules };
    onNodeChange(nodePath, newNode);
  };

  const handleRemoveNode = (nodePath: string) => {
    onRemoveNode?.(nodePath);
  };

  const handleConvertToGroup = (nodePath: string) => {
    if (!('value' in node)) return;
    const newGroup: LogicGroup = {
      id: crypto.randomUUID(),
      type: 'all',
      rules: [node as LeafRule],
    };
    onNodeChange(nodePath, newGroup);
  };

  if (!isGroup) {
    const leafNode = node as LeafRule;
    const fieldConfig = safeStringFields.find(f => f.formKey === leafNode.type) || safeStringFields[0];

    return (
      <div className="flex items-center gap-3 bg-[var(--app-panel)] p-3 rounded-[10px] border border-[var(--app-stroke)] hover:border-[var(--app-accent-border)] transition-all group">
        <div className="sortable-handle cursor-grab text-[var(--app-text-quaternary)] group-hover:text-[var(--app-accent)] px-1 font-bold select-none">
          <GripVertical className="w-4 h-4" />
        </div>
        <SearchableFieldSelect
          value={leafNode.type}
          fields={safeStringFields}
          onChange={(formKey) => {
            const newNode: LeafRule = {
              id: crypto.randomUUID(),
              type: formKey,
              value: leafNode.value,
            };
            onNodeChange(path, newNode);
          }}
          onConvertToGroup={() => handleConvertToGroup(path)}
          className="min-w-[140px]"
        />
        {fieldConfig?.type === 'boolean' ? (
          <select
            value={/^true$/i.test(leafNode.value) ? 'true' : 'false'}
            onChange={(e) => handleValueChange(path, e.target.value)}
            className="flex-1 min-w-0 text-[13px] bg-[var(--app-panel-soft)] px-3 py-1.5 rounded-[10px] border border-[var(--app-stroke)] hover:border-[var(--app-stroke-strong)] outline-none"
          >
            <option value="true">{t('advancedRuleEditor.yes')}</option>
            <option value="false">{t('advancedRuleEditor.no')}</option>
          </select>
        ) : (
          <input
            type="text"
            value={leafNode.value}
            onChange={(e) => handleValueChange(path, e.target.value)}
            placeholder={fieldConfig?.placeholder || t('advancedRuleEditor.matchValuePlaceholder')}
            className="flex-1 text-[13px] bg-[var(--app-panel-soft)] px-3 py-1.5 rounded-[10px] border border-[var(--app-stroke)] hover:border-[var(--app-stroke-strong)] focus:border-[var(--app-accent-border)] outline-none focus:ring-0 placeholder:text-[var(--app-text-quaternary)] min-w-0"
          />
        )}
        <button
          type="button"
          onClick={() => handleRemoveNode(path)}
          className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--app-text-quaternary)] hover:text-[var(--app-danger)] transition"
          aria-label={t('common.delete')}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  const groupNode = node as LogicGroup;

  return (
    <div className="mb-4 sortable-item" data-path={path}>
      <div className="bg-[var(--app-panel)] border border-[var(--app-stroke)] rounded-[14px] overflow-hidden transition-all duration-300">
        <div
          className="px-5 py-3.5 flex items-center justify-between hover:bg-[var(--app-hover)] transition-colors group/header cursor-pointer"
          onClick={handleToggleFold}
        >
          <div className="flex items-center gap-3">
            <div className="sortable-handle cursor-grab active:cursor-grabbing transition-colors duration-300 p-0.5 rounded-[6px] hover:bg-[var(--app-hover)]">
              <GripVertical className="w-4 h-4 text-[var(--app-text-quaternary)] hover:text-[var(--app-accent)]" />
            </div>
            <button
              type="button"
              className={`transition-transform duration-300 p-0.5 rounded-[6px] hover:bg-[var(--app-hover)] ${isFolded ? '-rotate-90' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setIsFolded(!isFolded);
              }}
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className="text-[var(--app-text-quaternary)] hover:text-[var(--app-accent)]">
                <path d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-[6px] bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)] uppercase tracking-tighter">
              {groupNode.type}
            </span>
            <select
              value={groupNode.type}
              onChange={(e) => {
                e.stopPropagation();
                handleTypeChange(e, path);
              }}
              onClick={(e) => e.stopPropagation()}
              className="text-[13px] font-semibold bg-transparent outline-none cursor-pointer text-[var(--app-text)] focus:text-[var(--app-accent)]"
            >
              <option value="all">{t('advancedRuleEditor.logicAll')}</option>
              <option value="any">{t('advancedRuleEditor.logicAny')}</option>
              <option value="not">{t('advancedRuleEditor.logicNot')}</option>
            </select>
          </div>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => handleAddRule(path)}
              className="text-[12px] font-medium text-[var(--app-accent)] hover:bg-[var(--app-accent-soft)] px-3 py-1.5 rounded-[10px] transition"
            >
              {t('advancedRuleEditor.addRule')}
            </button>
            {!isRoot && onRemoveNode && (
              <button
                type="button"
                onClick={() => handleRemoveNode(path)}
                className="p-2 text-[var(--app-text-quaternary)] hover:text-[var(--app-danger)] transition"
                aria-label={t('common.delete')}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <div
          className={`transition-all duration-300 overflow-hidden ${isFolded ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'
            }`}
        >
          <div
            ref={sortableRef}
            data-path={path}
            className="px-5 pb-5 pt-2 space-y-3 min-h-[40px] bg-[var(--app-panel-soft)]/30"
          >
            {groupNode.rules.length === 0 ? (
              <div className="text-center py-4 text-[var(--app-text-quaternary)] text-[13px] italic">
                {t('common.noRules')}
              </div>
            ) : (
              groupNode.rules.map((rule, index) => (
                <div key={rule.id} className="sortable-item" data-path={`${path}-${index}`}>
                  <NativeStyleRuleEditor
                    node={rule}
                    path={path ? `${path},${index}` : String(index)}
                    onNodeChange={onNodeChange}
                    onRemoveNode={onRemoveNode}
                    stringFields={safeStringFields}
                    isRoot={false}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
