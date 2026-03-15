import React, { useState } from 'react';
import type { RuleFieldsEditorProps, RuleTreeNode, LogicGroup, LeafRule, RuleFieldConfig } from './types/ruleFields';
import { getDefaultRuleTreeNode } from './utils/ruleFieldsUtils';
import { RULE_FIELD_CONFIG } from './utils/ruleFieldConfig';
import { NativeStyleRuleEditor } from './components/NativeStyleRuleEditor';

/**
 * 主规则字段编辑器组件
 * 基于规则树结构，支持嵌套逻辑组
 */
export function RuleFieldsEditor({ form, onFormChange }: RuleFieldsEditorProps) {
  const [ruleTree, setRuleTree] = useState<RuleTreeNode>(() => {
    return form.ruleGroupsTree as RuleTreeNode || getDefaultRuleTreeNode();
  });

  const handleNodeChange = (path: string, newNode: RuleTreeNode) => {
    const newTree = updateNodeAtPath(ruleTree, path, newNode);
    setRuleTree(newTree);
    onFormChange({ ruleGroupsTree: newTree });
  };

  const handleRemoveNode = (path: string) => {
    if (!path) return; // 不能删除根节点
    const parentPath = path.split(',').slice(0, -1).join(',');
    const indexToRemove = parseInt(path.split(',').pop() || '0');
    
    const parent = getNodeAtPath(ruleTree, parentPath);
    if (parent && 'rules' in parent) {
      const newRules = [...parent.rules];
      newRules.splice(indexToRemove, 1);
      const newParent = { ...parent, rules: newRules };
      handleNodeChange(parentPath, newParent);
    }
  };

  return (
    <div className="space-y-4 p-4 bg-slate-50 rounded-lg">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-700">规则编辑器</h3>
        <button
          onClick={() => {
            const newTree = getDefaultRuleTreeNode();
            setRuleTree(newTree);
            onFormChange({ ruleGroupsTree: newTree });
          }}
          className="text-xs text-indigo-600 hover:text-indigo-800"
        >
          重置
        </button>
      </div>
      
      <div className="bg-white p-4 rounded-lg border">
        <NativeStyleRuleEditor
          node={ruleTree}
          path=""
          onNodeChange={handleNodeChange}
          onRemoveNode={handleRemoveNode}
          stringFields={RULE_FIELD_CONFIG}
          isRoot={true}
        />
      </div>
    </div>
  );
}

// 辅助函数：获取指定路径的节点
function getNodeAtPath(root: RuleTreeNode, path: string): RuleTreeNode | null {
  if (!path) return root;
  const indices = path.split(',').map(Number);
  let current: RuleTreeNode = root;

  for (const index of indices) {
    if ('rules' in current && Array.isArray(current.rules)) {
      current = current.rules[index];
      if (!current) return null;
    } else {
      return null;
    }
  }
  return current;
}

// 辅助函数：更新指定路径的节点
function updateNodeAtPath(root: RuleTreeNode, path: string, newNode: RuleTreeNode): RuleTreeNode {
  if (!path) return newNode;

  const indices = path.split(',').map(Number);

  function replaceAt(node: RuleTreeNode, pathIndices: number[]): RuleTreeNode {
    if (pathIndices.length === 1) {
      if ('rules' in node && Array.isArray(node.rules)) {
        const newRules = [...node.rules];
        newRules[pathIndices[0]] = newNode;
        return { ...node, rules: newRules };
      }
      return node;
    }

    const [currentIndex, ...remainingIndices] = pathIndices;
    if ('rules' in node && Array.isArray(node.rules)) {
      const newRules = [...node.rules];
      newRules[currentIndex] = replaceAt(newRules[currentIndex], remainingIndices);
      return { ...node, rules: newRules };
    }
    return node;
  }

  return replaceAt(JSON.parse(JSON.stringify(root)), indices);
}

// 为了兼容性保留 RuleGroupTreeNode 类型别名
type RuleGroupTreeNode = RuleTreeNode;

export type { RuleGroupTreeNode };