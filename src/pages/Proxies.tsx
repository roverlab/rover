import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '../components/Sidebar';
import { Zap, Search, MoreVertical, RefreshCw, Activity, X, LayoutGrid, List, ArrowUpDown, AlignLeft, Monitor, ArrowLeft, Settings } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useApi } from '../contexts/ApiContext';
import { selectProxy, getProxyDelay, fetchProxies } from '../services/api';
import { useNotificationState, NotificationList } from '../components/ui/Notification';


interface Node {
  name: string;
  type: string;
  delay?: number;
  /** 从 API history 获取的延迟时间（初始化时显示） */
  historyDelay?: number;
  /** 节点所属的组类型（用于判断是否可选） */
  groupType?: string;
}

interface ProxyGroup {
  name: string;
  type: string;
  now: string;
  nodes: Node[];
}

type ViewStyle = 'tabs' | 'list';
type SortBy = 'default' | 'delay' | 'name';
type LayoutDensity = 'loose' | 'normal' | 'compact';
type SizeOption = 'normal' | 'compact' | 'minimal';

interface ProxySettings {
  viewStyle: ViewStyle;
  sortBy: SortBy;
  layoutDensity: LayoutDensity;
  sizeOption: SizeOption;
}

const DEFAULT_SETTINGS: ProxySettings = {
  viewStyle: 'tabs',
  sortBy: 'default',
  layoutDensity: 'normal',
  sizeOption: 'normal'
};

// 独立的节点卡片组件，使用 memo 避免不必要的重渲染
interface NodeCardProps {
  name: string;
  type: string;
  isSelected: boolean;
  isSelectable: boolean;
  delay?: number;
  testState?: 'queued' | 'testing';
  sizeClasses: string;
  onSelect: () => void;
  getDelayClass: (delay?: number) => string;
  /** URLTest 类型组的当前选择节点名称 */
  currentNode?: string;
  /** 超时文本 */
  timeoutLabel: string;
}

const NodeCard = memo(function NodeCard({
  name,
  type,
  isSelected,
  isSelectable,
  delay,
  testState,
  sizeClasses,
  onSelect,
  getDelayClass,
  currentNode,
  timeoutLabel
}: NodeCardProps) {
  // Selector 和 URLTest 类型显示当前选择的节点
  const showCurrentNode = type === 'selector' || type === 'Selector' || type === 'urltest' || type === 'URLTest';
  return (
    <div
      onClick={onSelect}
      className={cn(
        "panel-soft px-4 py-3 transition-colors flex flex-col relative overflow-hidden",
        sizeClasses,
        isSelected
          ? "bg-[var(--app-accent-soft-card)] border-[var(--app-accent-border)]"
          : "hover:border-[rgba(39,44,54,0.14)] hover:bg-white/80",
        isSelectable ? "cursor-pointer" : "cursor-default"
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn(
          "font-medium truncate text-[13px] tracking-tight max-w-[80%]",
          isSelected ? "text-[var(--app-text)]" : "text-[var(--app-text-secondary)]"
        )}>
          {name}
        </div>
      </div>

      {/* 延迟显示 - 测速状态或延迟数据存在时显示 */}
      {(testState || delay !== undefined) ? (
        <div className={cn("text-[12px] font-mono mt-0 absolute right-3.5 top-3",
            testState === 'testing' ? "text-[var(--app-accent)]" :
              testState === 'queued' ? "text-[var(--app-text-quaternary)]" :
                getDelayClass(delay))}>
          {testState === 'testing' ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--app-accent)]" />
          ) : testState === 'queued' ? (
            '...'
          ) : delay && delay > 0 ? (
            `${delay} ms`
          ) : (
            timeoutLabel
          )}
        </div>
      ) : null}

      <div className="mt-auto flex items-center text-[var(--app-text-quaternary)]">
        <span className="text-[11px] font-medium flex-1">
          {type}
          {/* Selector 和 URLTest 类型显示当前选择的节点 */}
          {showCurrentNode && currentNode && (
            <span className="ml-1 text-[var(--app-text-quaternary)]">
              ({currentNode})
            </span>
          )}
        </span>
      </div>
    </div>
  );
});

interface ProxiesProps {
  isActive?: boolean;
}

export function Proxies({ isActive = true }: ProxiesProps) {
const { t } = useTranslation();
const { apiUrl, apiSecret } = useApi();
  const { notifications, addNotification, removeNotification } = useNotificationState();
  const [groups, setGroups] = useState<ProxyGroup[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');
  const [selectedNodes, setSelectedNodes] = useState<Record<string, string>>({});
  const [initialLoading, setInitialLoading] = useState(true); // 仅用于首次加载
  const [nodeTestState, setNodeTestState] = useState<Record<string, 'queued' | 'testing'>>({});
  const [nodeDelays, setNodeDelays] = useState<Record<string, number>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<ProxySettings>(DEFAULT_SETTINGS);

  const [showTabsPopup, setShowTabsPopup] = useState(false);

  // 搜索相关状态
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInputFocused, setSearchInputFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const testQueueRef = useRef<Node[]>([]);
  const testingCountRef = useRef(0);
  const switchingRef = useRef(false); // 用于防止切换时被轮询覆盖
  const activeGroupNameRef = useRef<string>(''); // 用于存储当前活动组名
  const isTestRunningRef = useRef(false); // 防止测试重复触发
  const activeTabRef = useRef<string>(''); // 用于存储当前 activeTab，避免循环依赖
  const MAX_CONCURRENT_TESTS = 10; // 最大并发测试数量

  // 异步获取 API 数据（延迟和当前选择状态）
  const fetchApiDataAsync = useCallback(async (currentGroups: ProxyGroup[]) => {
    if (!apiUrl || currentGroups.length === 0) return;

    try {
      const apiData = await fetchProxies(apiUrl, apiSecret);
      const proxies = apiData?.proxies || {};

      // 更新当前选择状态
      const newSelected: Record<string, string> = {};
      for (const g of currentGroups) {
        const p = proxies[g.name];
        if (p && typeof p.now === 'string' && p.now) {
          newSelected[g.name] = p.now;
        }
      }

      // 更新延迟数据 - 所有代理节点都获取延迟（没有 history 的设为 0 表示超时）
      const newHistoryDelays: Record<string, number> = {};
      for (const [proxyName, proxyData] of Object.entries(proxies)) {
        const pData = proxyData as { history?: Array<{ time: string; delay: number }> };
        if (Array.isArray(pData.history) && pData.history.length > 0) {
          const latestHistory = pData.history[pData.history.length - 1];
          if (latestHistory && typeof latestHistory.delay === 'number') {
            newHistoryDelays[proxyName] = latestHistory.delay;
          } else {
            // history 存在但没有有效的 delay 数据，设为 0（超时）
            newHistoryDelays[proxyName] = 0;
          }
        } else {
          // 没有 history 数据，设为 0（超时）
          newHistoryDelays[proxyName] = 0;
        }
      }

      // 批量更新状态
      if (!switchingRef.current && Object.keys(newSelected).length > 0) {
        setSelectedNodes(prev => ({ ...prev, ...newSelected }));
      }
      // 即使没有延迟数据也要更新，确保状态一致性
      setNodeDelays(prev => ({ ...prev, ...newHistoryDelays }));
    } catch (err) {
      // API 不可用时静默失败，但记录错误便于调试
            console.log('[Proxies] API data fetch failed:', err);
    }
  }, [apiUrl, apiSecret]);

  const loadProxies = useCallback(async (force = false) => {
    // 如果正在切换节点且不是强制刷新，跳过本次轮询
    if (switchingRef.current && !force) return;

    try {
      // 从配置文件读取代理组结构
      const result = await window.ipcRenderer.core.getSelectedProfile();
      if (!result) {
        // 配置文件不存在，显示空白
        setGroups([]);
        setSelectedNodes({});
        setInitialLoading(false);
        return;
      }

      const { config } = result;
      const outbounds = config.outbounds || [];

      const newGroups: ProxyGroup[] = [];
      const newSelected: Record<string, string> = {};

      // 解析 outbounds 构建代理组（配置文件中的 outbounds[0] 仅为初始顺序，非运行时选择）
      // 隐藏 tag 为 selector_out 的系统分组
      const HIDDEN_GROUP_TAGS = ['selector_out'];
      for (const outbound of outbounds) {
        if (HIDDEN_GROUP_TAGS.includes(outbound.tag)) continue;
        // selector 类型的出站作为代理组
        if (outbound.type === 'selector' && outbound.outbounds && outbound.outbounds.length > 0) {
          const nodes = outbound.outbounds
            .filter((name: string) => name !== 'DIRECT' && name !== 'REJECT')
            .map((name: string) => {
              // 查找对应节点的类型
              const nodeOutbound = outbounds.find((o: any) => o.tag === name);
              return {
                name,
                type: nodeOutbound?.type || 'unknown'
              };
            });

          if (nodes.length > 0) {
            newGroups.push({
              name: outbound.tag,
              type: outbound.type,
              now: outbound.outbounds[0] || nodes[0]?.name,
              nodes
            });
            // 先用配置文件中的顺序作为兜底，后续会用 API 的 now 覆盖
            newSelected[outbound.tag] = outbound.outbounds[0] || nodes[0]?.name;
          }
        }
        // urltest 类型的出站也作为代理组
        if (outbound.type === 'urltest' && outbound.outbounds && outbound.outbounds.length > 0) {
          const nodes = outbound.outbounds
            .filter((name: string) => name !== 'DIRECT' && name !== 'REJECT')
            .map((name: string) => {
              const nodeOutbound = outbounds.find((o: any) => o.tag === name);
              return {
                name,
                type: nodeOutbound?.type || 'unknown'
              };
            });

          if (nodes.length > 0) {
            newGroups.push({
              name: outbound.tag,
              type: outbound.type,
              now: nodes[0]?.name,
              nodes
            });
            newSelected[outbound.tag] = nodes[0]?.name;
          }
        }
      }

      // 立即显示节点（不等待 API）
      setGroups(newGroups);
      if (!switchingRef.current) {
        setSelectedNodes(newSelected);
      }

      if (newGroups.length > 0 && (!activeTabRef.current || !newGroups.find(g => g.name === activeTabRef.current))) {
        const main = newGroups.find(g => g.name === 'PROXIES' || g.name === 'Proxy') || newGroups[0];
        setActiveTab(main.name);
      }

      // 异步获取 API 数据（延迟和当前选择状态）
      fetchApiDataAsync(newGroups);
    } catch (err: any) {
      // 读取失败，显示空白
      setGroups([]);
      setSelectedNodes({});
    } finally {
      setInitialLoading(false);
    }
  }, [fetchApiDataAsync]);

  // 页面激活时加载代理数据（每次进入页面刷新）
  useEffect(() => {
    if (isActive) {
      loadProxies();
    }
  }, [isActive]);

  // 从数据库加载代理页设置
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const saved = await window.ipcRenderer.db.getSetting('proxies-page-settings');
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<ProxySettings>;
          setSettings(prev => ({
            ...prev,
            ...(parsed.viewStyle && ['tabs', 'list'].includes(parsed.viewStyle) && { viewStyle: parsed.viewStyle }),
            ...(parsed.sortBy && ['default', 'delay', 'name'].includes(parsed.sortBy) && { sortBy: parsed.sortBy }),
            ...(parsed.layoutDensity && ['loose', 'normal', 'compact'].includes(parsed.layoutDensity) && { layoutDensity: parsed.layoutDensity }),
            ...(parsed.sizeOption && ['normal', 'compact', 'minimal'].includes(parsed.sizeOption) && { sizeOption: parsed.sizeOption }),
          }));
        }
      } catch (e) {
            console.error('[Proxies] Failed to load settings:', e);
      }
    };
    loadSettings();
  }, []);

  // 设置变更时保存到数据库
  const settingsSavedRef = useRef(false);
  useEffect(() => {
    if (!settingsSavedRef.current) {
      settingsSavedRef.current = true;
      return;
    }
    window.ipcRenderer.db.setSetting('proxies-page-settings', JSON.stringify(settings)).catch(e => {
            console.error('[Proxies] Failed to save settings:', e);
    });
  }, [settings]);

  const handleSelectNode = useCallback(async (groupName: string, nodeName: string, isSelectable: boolean) => {
    if (!isSelectable) return;

    // 乐观更新：立即更新 UI
    setSelectedNodes(prev => ({ ...prev, [groupName]: nodeName }));
    switchingRef.current = true;

    try {
      await selectProxy(apiUrl, apiSecret, groupName, nodeName);
    } catch (err) {
      console.error('Failed to select proxy', err);
      // 切换失败，恢复之前的状态
      loadProxies(true);
    } finally {
      switchingRef.current = false;
    }
  }, [apiUrl, apiSecret, loadProxies]);

  // 使用 ref 存储 processQueue 的最新引用，避免闭包问题
  const processQueueRef = useRef<() => void>();

  const processQueue = useCallback(async () => {
    if (testingCountRef.current >= MAX_CONCURRENT_TESTS || testQueueRef.current.length === 0) return;

    while (testingCountRef.current < MAX_CONCURRENT_TESTS && testQueueRef.current.length > 0) {
      const node = testQueueRef.current.shift()!;
      const nodeName = node.name;
      testingCountRef.current++;

      setNodeTestState(prev => ({ ...prev, [nodeName]: 'testing' }));

      const finishTest = (delay: number) => {
        setNodeDelays(prev => ({ ...prev, [nodeName]: delay }));
        setNodeTestState(prev => {
          const next = { ...prev };
          delete next[nodeName];
          return next;
        });
        testingCountRef.current--;
        if (testQueueRef.current.length > 0 || testingCountRef.current > 0) {
          // 使用 setTimeout 确保使用最新的 processQueue 引用
          setTimeout(() => processQueueRef.current?.(), 0);
        } else {
          isTestRunningRef.current = false;
        }
      };

      // 代理节点：调用 sing-box API 测速
      const testUrl = 'http://www.gstatic.com/generate_204';
      getProxyDelay(apiUrl, apiSecret, nodeName, testUrl).then(data => {
        finishTest(data.delay);
      }).catch(e => {
        finishTest(0);
      });
    }
  }, [apiUrl, apiSecret]);

  // 同步 processQueue 到 ref
  useEffect(() => {
    processQueueRef.current = processQueue;
  }, [processQueue]);

  const enqueueTest = useCallback((node: Node) => {
    // 检查是否已经在队列中或正在测试
    if (nodeTestState[node.name]) return;
    // 检查是否已经在 testQueueRef 中
    if (testQueueRef.current.some(n => n.name === node.name)) return;

    testQueueRef.current.push(node);
    setNodeTestState(prev => ({ ...prev, [node.name]: 'queued' }));
    // 使用 ref 调用最新的 processQueue
    processQueueRef.current?.();
  }, [nodeTestState]);

  // 搜索结果 - 在所有组中搜索匹配的节点（需在 testLatency 之前定义）
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];

    const query = searchQuery.toLowerCase();
    const results: Array<{ group: ProxyGroup; node: Node }> = [];

    groups.forEach(group => {
      group.nodes.forEach(node => {
        if (node.name.toLowerCase().includes(query) ||
            node.type.toLowerCase().includes(query)) {
          results.push({ group, node });
        }
      });
    });

    return results;
  }, [groups, searchQuery]);


  // 当前搜索选中的组
  const [searchActiveGroup, setSearchActiveGroup] = useState<string>('');

  // 当前显示的搜索结果节点（按选中的组过滤）
  const displayedSearchNodes = useMemo(() => {
    if (!searchActiveGroup) return searchResults;
    return searchResults.filter(r => r.group.name === searchActiveGroup);
  }, [searchResults, searchActiveGroup]);

  const testLatency = useCallback(async () => {
    // 防止重复触发
    if (isTestRunningRef.current) return;

    // 搜索模式且搜索不为空时，只测当前页面显示的节点
    let nodesToTest: Node[];
    if (isSearchMode && searchQuery.trim()) {
      const names = [...new Set(displayedSearchNodes.map(r => r.node.name))];
      nodesToTest = names.map(name => {
        const r = displayedSearchNodes.find(x => x.node.name === name)!;
        return r.node;
      });
    } else if (isSearchMode) {
      const groupToTest = groups.find(g => g.name === searchActiveGroup);
      nodesToTest = groupToTest?.nodes ?? [];
    } else {
      const groupToTest = groups.find(g => g.name === activeTab);
      nodesToTest = groupToTest?.nodes ?? [];
    }

    if (nodesToTest.length === 0) return;

    // 检查内核是否启动
    const running = await window.ipcRenderer.core.isRunning();
    if (!running) {
      addNotification(t('proxies.coreNotRunning'), 'warning');
      return;
    }

    isTestRunningRef.current = true;

    // 清空即将测试的节点的延迟数据（保留其他节点的测速结果）
    setNodeDelays(prev => {
      const next = { ...prev };
      nodesToTest.forEach(n => {
        delete next[n.name];
      });
      return next;
    });

    // 将需要测试的节点加入队列（排除已在测试中或已在队列中的）
    const toEnqueue = nodesToTest.filter(n => {
      if (nodeTestState[n.name]) return false; // 已经在测试中
      if (testQueueRef.current.some(qn => qn.name === n.name)) return false; // 已经在队列中
      return true;
    });
    toEnqueue.forEach(n => {
      testQueueRef.current.push(n);
    });

    // 批量设置状态
    setNodeTestState(prev => {
      const nextState = { ...prev };
      toEnqueue.forEach(n => {
        nextState[n.name] = 'queued';
      });
      return nextState;
    });

    // 开始处理队列
    processQueueRef.current?.();
  }, [groups, activeTab, searchActiveGroup, isSearchMode, searchQuery, displayedSearchNodes, nodeTestState, apiUrl, apiSecret, addNotification]);

  const getDelayClass = useCallback((delay?: number) => {
    if (delay === undefined) return 'text-red-500';
    if (!delay || delay === 0) return 'text-red-500';
    if (delay < 200) return 'text-green-500';
    if (delay < 500) return 'text-yellow-600';
    return 'text-red-500';
  }, []);

  // 进入搜索模式时，默认选中第一个组
  useEffect(() => {
    if (isSearchMode && groups.length > 0 && !searchActiveGroup) {
      setSearchActiveGroup(groups[0].name);
    }
  }, [isSearchMode, groups, searchActiveGroup]);

  // 退出搜索模式时清空搜索状态
  const exitSearchMode = useCallback(() => {
    setIsSearchMode(false);
    setSearchQuery('');
    setSearchActiveGroup('');
  }, []);

  // 进入搜索模式时聚焦输入框
  useEffect(() => {
    if (isSearchMode && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchMode]);

  // 使用 useMemo 缓存布局样式
  const layoutClasses = useMemo(() => {
    const densityClasses = {
      loose: 'gap-4',
      normal: 'gap-3',
      compact: 'gap-2'
    };
    return densityClasses[settings.layoutDensity];
  }, [settings.layoutDensity]);

  const sizeClasses = useMemo(() => {
    const sizeMap = {
      normal: 'h-[96px]',
      compact: 'h-[76px]',
      minimal: 'h-[56px]'
    };
    return sizeMap[settings.sizeOption];
  }, [settings.sizeOption]);

  const gridCols = useMemo(() => {
    if (settings.viewStyle === 'list') {
      return 'grid-cols-1';
    }
    switch (settings.sizeOption) {
      case 'minimal':
        return 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7';
      case 'compact':
        return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';
      default:
        return 'grid-cols-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';
    }
  }, [settings.viewStyle, settings.sizeOption]);

  const activeGroupData = groups.find(g => g.name === activeTab);
  const isSelectableGroup = activeGroupData?.type === 'selector' || activeGroupData?.type === 'Selector';

  // 统一计算当前显示的节点列表（普通模式和搜索模式共用）
  const displayedNodes = useMemo(() => {
    // 搜索模式
    if (isSearchMode) {
      if (searchQuery.trim()) {
        // 有搜索词：显示搜索结果
        return displayedSearchNodes.map(({ group, node }) => ({
          node,
          group,
          key: `${group.name}-${node.name}`,
          isSelected: selectedNodes[group.name] === node.name,
          isSelectable: group.type === 'selector' || group.type === 'Selector',
        }));
      } else {
        // 无搜索词：显示当前选中组的所有节点
        const group = groups.find(g => g.name === searchActiveGroup);
        if (!group) return [];
        return group.nodes.map(node => ({
          node,
          group,
          key: node.name,
          isSelected: selectedNodes[group.name] === node.name,
          isSelectable: group.type === 'selector' || group.type === 'Selector',
        }));
      }
    }
    // 普通模式
    if (!activeGroupData) return [];
    // 应用排序
    const nodes = [...activeGroupData.nodes];
    let sortedNodes = nodes;
    if (settings.sortBy === 'delay') {
      sortedNodes = nodes.sort((a, b) => {
        const delayA = nodeDelays[a.name];
        const delayB = nodeDelays[b.name];
        const effectiveA = (delayA != null && delayA > 0) ? delayA : Infinity;
        const effectiveB = (delayB != null && delayB > 0) ? delayB : Infinity;
        const diff = effectiveA - effectiveB;
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name);
      });
    } else if (settings.sortBy === 'name') {
      sortedNodes = nodes.sort((a, b) => a.name.localeCompare(b.name));
    }
    return sortedNodes.map(node => ({
      node,
      group: activeGroupData,
      key: node.name,
      isSelected: selectedNodes[activeGroupData.name] === node.name,
      isSelectable: isSelectableGroup,
    }));
  }, [isSearchMode, searchQuery, displayedSearchNodes, groups, searchActiveGroup, activeGroupData, settings.sortBy, nodeDelays, selectedNodes, isSelectableGroup]);

  // 更新 ref 以便在回调中使用
  useEffect(() => {
    if (activeGroupData?.name) {
      activeGroupNameRef.current = activeGroupData.name;
    }
  }, [activeGroupData?.name]);

  // 同步 activeTab 到 ref
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // 稳定的节点选择回调
  const handleCardSelect = useCallback((groupName: string, nodeName: string, isSelectable: boolean) => {
    handleSelectNode(groupName, nodeName, isSelectable);
  }, [handleSelectNode]);

  return (
    <div className="page-shell text-[var(--app-text-secondary)]">

      {isSearchMode ? (
        /* 搜索模式头部 - 左侧显示标题，与普通模式同结构 */
          <div className="page-header shrink-0 z-20" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
            <div className="shrink-0">
              <h1 className="page-title">{t('proxies.title')}</h1>
              <p className="page-subtitle">{t('proxies.subtitle')}</p>
            </div>
          <div className="toolbar flex-1 min-w-0 flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {/* 返回按钮 - 与搜索栏同高 (38px) */}
            <button
              onClick={exitSearchMode}
              className="w-[38px] h-[38px] flex items-center justify-center rounded-[14px] hover:bg-[var(--app-hover)] text-[var(--app-text-secondary)] transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            {/* 搜索输入框 - 与 input-field 同高 (38px)，占满剩余空间 */}
            <div className={cn(
              "flex items-center flex-1 min-h-[38px] h-[38px] min-w-0 px-3 rounded-[14px] transition-all bg-[var(--app-panel-soft)] ring-1",
              searchInputFocused
                ? "bg-white ring-[var(--app-accent)]"
                : "ring-[var(--app-stroke)]"
            )}>
              <Search className="w-4 h-4 text-[var(--app-text-tertiary)] shrink-0 mr-2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchInputFocused(true)}
                onBlur={() => setSearchInputFocused(false)}
                placeholder={t('proxies.searchNodes')}
                className="flex-1 bg-transparent text-[14px] text-[var(--app-text)] placeholder:text-[var(--app-text-quaternary)] outline-none border-none appearance-none focus:ring-0 focus:shadow-none focus-visible:ring-0 focus-visible:shadow-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="ml-1 p-1 rounded-full hover:bg-[var(--app-hover)] text-[var(--app-text-tertiary)]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* 普通模式头部 */
        <div className="page-header shrink-0 z-20" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <div>
            <h1 className="page-title">{t('proxies.title')}</h1>
            <p className="page-subtitle">{t('proxies.subtitle')}</p>
          </div>
          <div className="toolbar" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {/* 搜索按钮 */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSearchMode(true)}
              className="w-9 h-9"
            >
              <Search className="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              className={cn(settingsOpen && "text-[var(--app-accent-strong)] bg-[var(--app-accent-soft)]")}
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="page-content">
        {groups.length === 0 && !initialLoading ? (
          <div className="empty-state text-[13px]">{t('proxies.noProxies')}</div>
        ) : (
          <>
            {/* 组标签栏 */}
            <div className="px-4 py-2 mb-4 shrink-0 relative flex items-center gap-1">
              <div className={cn(
                "flex space-x-1 overflow-x-auto flex-1",
                "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']"
              )}>
                {groups.map(g => (
                  <button
                    key={g.name}
                    onClick={() => isSearchMode ? setSearchActiveGroup(g.name) : setActiveTab(g.name)}
                    className={cn(
                      "px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors relative rounded-[6px]",
                      (isSearchMode ? searchActiveGroup : activeTab) === g.name
                        ? "text-[var(--app-text)]"
                        : "text-[var(--app-text-quaternary)] hover:text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)]"
                    )}
                  >
                    {g.name}
                    {(isSearchMode ? searchActiveGroup : activeTab) === g.name && (
                      <div className="absolute bottom-0.5 left-3 right-3 h-0.5 bg-[var(--app-accent)] rounded-full" />
                    )}
                  </button>
                ))}
              </div>
              {/* 更多按钮 - 仅普通模式显示 */}
              {!isSearchMode && (
                <button
                  onClick={() => setShowTabsPopup(true)}
                  className="w-7 h-7 flex items-center justify-center rounded-[6px] bg-white shadow-sm border border-[var(--app-divider)] hover:bg-[var(--app-hover)] transition-colors shrink-0 z-10"
                  title={t('proxies.viewAllGroups')}
                >
                  <MoreVertical className="w-4 h-4 text-[var(--app-text-secondary)]" />
                </button>
              )}
            </div>

            {/* 节点网格 - 搜索模式和普通模式共用 */}
            <div className={cn("grid", gridCols, layoutClasses)}>
              {isSearchMode && searchQuery.trim() && displayedNodes.length === 0 ? (
                /* 无搜索结果 */
                <div className="col-span-full flex items-center justify-center py-20 text-[var(--app-text-tertiary)] text-[13px]">
                  {t('proxies.noMatchingNodes')}
                </div>
              ) : (
                displayedNodes.map(({ node, group, key, isSelected, isSelectable }) => (
                  <NodeCard
                    key={key}
                    name={node.name}
                    type={node.type}
                    isSelected={isSelected}
                    isSelectable={isSelectable}
                    delay={nodeDelays[node.name]}
                    testState={nodeTestState[node.name]}
                    sizeClasses={sizeClasses}
                    onSelect={() => handleCardSelect(group.name, node.name, isSelectable)}
                    getDelayClass={getDelayClass}
                    currentNode={(node.type === 'urltest' || node.type === 'URLTest') ? selectedNodes[node.name] : undefined}
                    timeoutLabel={'Timeout'}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Tabs Popup - 使用 createPortal 确保 Electron 下点击外部可关闭 */}
      {showTabsPopup && createPortal(
        <>
          <div
            className="fixed inset-0 z-[200]"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onClick={() => setShowTabsPopup(false)}
          />
          <div
            className="fixed right-4 top-[130px] bg-white z-[201] shadow-lg rounded-[12px] border border-[var(--app-divider)] max-w-[280px] p-3"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <div className="flex flex-wrap gap-2">
              {groups.map(g => (
                <button
                  key={g.name}
                  onClick={() => {
                    setActiveTab(g.name);
                    setShowTabsPopup(false);
                  }}
                  className={cn(
                    "px-3 py-1.5 text-[13px] font-medium rounded-[6px] transition-colors whitespace-nowrap",
                    activeTab === g.name
                      ? "text-[var(--app-accent-strong)] bg-[var(--app-accent-soft)]"
                      : "text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)]"
                  )}
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}

      {/* 右下角一键测速：搜索模式且搜索不为空时只测当前页显示的节点，否则测本组全部节点 */}
      {Object.keys(nodeTestState).length === 0 && !initialLoading && (
        isSearchMode && searchQuery.trim()
          ? displayedSearchNodes.length > 0
          : (isSearchMode ? groups.find(g => g.name === searchActiveGroup)?.nodes?.length : activeGroupData?.nodes?.length)
      ) ? (
        <button
          onClick={testLatency}
          className="floating-action w-[52px] h-[52px]"
          title={isSearchMode && searchQuery.trim() ? t('proxies.testLatencyCurrentPage') : t('proxies.testLatencyGroup')}
        >
          <Activity className="w-5 h-5 fill-current animate-pulse opacity-70" />
        </button>
      ) : null}

      {/* Settings Panel - 使用 createPortal 渲染到 body，确保 Electron 下关闭按钮和点击外部可关闭 */}
      {settingsOpen && createPortal(
        <>
          {/* Backdrop - no-drag 使顶部区域点击也能关闭，否则 Electron 拖拽区域会拦截 */}
          <div
            className="fixed inset-0 bg-black/20 z-[200]"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onClick={() => setSettingsOpen(false)}
          />
          {/* Panel */}
          <div
            className="fixed right-0 top-12 bottom-0 w-[280px] bg-white z-[201] shadow-[-4px_0_24px_rgba(0,0,0,0.08)] flex flex-col rounded-tl-[18px]"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between px-4 py-4 border-b border-[var(--app-divider)]">
              <span className="text-[15px] font-semibold text-[var(--app-text)]">{t('proxies.settings')}</span>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-[10px] hover:bg-[var(--app-hover)] text-[var(--app-text-tertiary)] transition-colors"
                aria-label="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* 风格 */}
              <div>
                <div className="text-[12px] font-medium text-[var(--app-text-tertiary)] mb-3">{t('proxies.style')}</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSettings(s => ({ ...s, viewStyle: 'tabs' }))}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-[12px] text-[13px] font-medium transition-all border",
                      settings.viewStyle === 'tabs'
                        ? "bg-[var(--app-accent-soft)] border-[var(--app-accent-border)] text-[var(--app-accent-strong)]"
                        : "bg-[var(--app-panel-soft)] border-transparent text-[var(--app-text-tertiary)] hover:text-[var(--app-text-secondary)]"
                    )}
                  >
                    <LayoutGrid className="w-4 h-4" />
                    {t('proxies.viewTabs')}
                  </button>
                  <button
                    onClick={() => setSettings(s => ({ ...s, viewStyle: 'list' }))}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-[12px] text-[13px] font-medium transition-all border",
                      settings.viewStyle === 'list'
                        ? "bg-[var(--app-accent-soft)] border-[var(--app-accent-border)] text-[var(--app-accent-strong)]"
                        : "bg-[var(--app-panel-soft)] border-transparent text-[var(--app-text-tertiary)] hover:text-[var(--app-text-secondary)]"
                    )}
                  >
                    <List className="w-4 h-4" />
                    {t('proxies.viewList')}
                  </button>
                </div>
              </div>

              {/* 排序 */}
              <div>
                <div className="text-[12px] font-medium text-[var(--app-text-tertiary)] mb-3">{t('proxies.sort')}</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSettings(s => ({ ...s, sortBy: 'default' }))}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-[12px] text-[12px] font-medium transition-all border",
                      settings.sortBy === 'default'
                        ? "bg-[var(--app-accent-soft)] border-[var(--app-accent-border)] text-[var(--app-accent-strong)]"
                        : "bg-[var(--app-panel-soft)] border-transparent text-[var(--app-text-tertiary)] hover:text-[var(--app-text-secondary)]"
                    )}
                  >
                    <AlignLeft className="w-3.5 h-3.5" />
                    {t('proxies.sortDefault')}
                  </button>
                  <button
                    onClick={() => setSettings(s => ({ ...s, sortBy: 'delay' }))}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-[12px] text-[12px] font-medium transition-all border",
                      settings.sortBy === 'delay'
                        ? "bg-[var(--app-accent-soft)] border-[var(--app-accent-border)] text-[var(--app-accent-strong)]"
                        : "bg-[var(--app-panel-soft)] border-transparent text-[var(--app-text-tertiary)] hover:text-[var(--app-text-secondary)]"
                    )}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    {t('proxies.sortDelay')}
                  </button>
                  <button
                    onClick={() => setSettings(s => ({ ...s, sortBy: 'name' }))}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-[12px] text-[12px] font-medium transition-all border",
                      settings.sortBy === 'name'
                        ? "bg-[var(--app-accent-soft)] border-[var(--app-accent-border)] text-[var(--app-accent-strong)]"
                        : "bg-[var(--app-panel-soft)] border-transparent text-[var(--app-text-tertiary)] hover:text-[var(--app-text-secondary)]"
                    )}
                  >
                    <ArrowUpDown className="w-3.5 h-3.5" />
                    {t('proxies.sortName')}
                  </button>
                </div>
              </div>

              {/* 布局 */}
              <div>
                <div className="text-[12px] font-medium text-[var(--app-text-tertiary)] mb-3">{t('proxies.layout')}</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSettings(s => ({ ...s, layoutDensity: 'loose' }))}
                    className={cn(
                      "flex-1 py-2 px-2 rounded-[12px] text-[12px] font-medium transition-all border",
                      settings.layoutDensity === 'loose'
                        ? "bg-[var(--app-accent-soft)] border-[var(--app-accent-border)] text-[var(--app-accent-strong)]"
                        : "bg-[var(--app-panel-soft)] border-transparent text-[var(--app-text-tertiary)] hover:text-[var(--app-text-secondary)]"
                    )}
                  >
                    {t('proxies.densityLoose')}
                  </button>
                  <button
                    onClick={() => setSettings(s => ({ ...s, layoutDensity: 'normal' }))}
                    className={cn(
                      "flex-1 py-2 px-2 rounded-[12px] text-[12px] font-medium transition-all border",
                      settings.layoutDensity === 'normal'
                        ? "bg-[var(--app-accent-soft)] border-[var(--app-accent-border)] text-[var(--app-accent-strong)]"
                        : "bg-[var(--app-panel-soft)] border-transparent text-[var(--app-text-tertiary)] hover:text-[var(--app-text-secondary)]"
                    )}
                  >
                    {t('proxies.densityNormal')}
                  </button>
                  <button
                    onClick={() => setSettings(s => ({ ...s, layoutDensity: 'compact' }))}
                    className={cn(
                      "flex-1 py-2 px-2 rounded-[12px] text-[12px] font-medium transition-all border",
                      settings.layoutDensity === 'compact'
                        ? "bg-[var(--app-accent-soft)] border-[var(--app-accent-border)] text-[var(--app-accent-strong)]"
                        : "bg-[var(--app-panel-soft)] border-transparent text-[var(--app-text-tertiary)] hover:text-[var(--app-text-secondary)]"
                    )}
                  >
                    {t('proxies.densityCompact')}
                  </button>
                </div>
              </div>

              {/* 尺寸 */}
              <div>
                <div className="text-[12px] font-medium text-[var(--app-text-tertiary)] mb-3">{t('proxies.size')}</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSettings(s => ({ ...s, sizeOption: 'normal' }))}
                    className={cn(
                      "flex-1 py-2 px-2 rounded-[12px] text-[12px] font-medium transition-all border",
                      settings.sizeOption === 'normal'
                        ? "bg-[var(--app-accent-soft)] border-[var(--app-accent-border)] text-[var(--app-accent-strong)]"
                        : "bg-[var(--app-panel-soft)] border-transparent text-[var(--app-text-tertiary)] hover:text-[var(--app-text-secondary)]"
                    )}
                  >
                    {t('proxies.sizeNormal')}
                  </button>
                  <button
                    onClick={() => setSettings(s => ({ ...s, sizeOption: 'compact' }))}
                    className={cn(
                      "flex-1 py-2 px-2 rounded-[12px] text-[12px] font-medium transition-all border",
                      settings.sizeOption === 'compact'
                        ? "bg-[var(--app-accent-soft)] border-[var(--app-accent-border)] text-[var(--app-accent-strong)]"
                        : "bg-[var(--app-panel-soft)] border-transparent text-[var(--app-text-tertiary)] hover:text-[var(--app-text-secondary)]"
                    )}
                  >
                    {t('proxies.sizeCompact')}
                  </button>
                  <button
                    onClick={() => setSettings(s => ({ ...s, sizeOption: 'minimal' }))}
                    className={cn(
                      "flex-1 py-2 px-2 rounded-[12px] text-[12px] font-medium transition-all border",
                      settings.sizeOption === 'minimal'
                        ? "bg-[var(--app-accent-soft)] border-[var(--app-accent-border)] text-[var(--app-accent-strong)]"
                        : "bg-[var(--app-panel-soft)] border-transparent text-[var(--app-text-tertiary)] hover:text-[var(--app-text-secondary)]"
                    )}
                  >
                    {t('proxies.sizeMinimal')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      <NotificationList notifications={notifications} onRemove={removeNotification} />
    </div>
  );
}
