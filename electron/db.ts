import fs from 'node:fs';
import { getDbPath, getDataDir, toDataRelativePath } from './paths';
import type { RuleProvider, LocalRuleSetData } from '../src/types/rule-providers';
import type { Policy } from '../src/types/policy';
import type { DnsPolicy } from '../src/types/dns-policy';
import { getPolicyRuleSet } from '../src/types/policy';

/** 订阅用户信息（从 Subscription-Userinfo 响应头解析） */
export interface SubscriptionUserinfo {
    /** 上传流量（字节） */
    upload: number;
    /** 下载流量（字节） */
    download: number;
    /** 总流量（字节） */
    total: number;
    /** 过期时间（Unix 时间戳） */
    expire: number;
}

/** 嵌入在 Profile 内的策略偏好（不含 profile_id） */
export interface ProfilePolicyItem {
    policy_id: string;
    preferred_outbounds: string[];
}

/** 嵌入在 Profile 内的 DNS 策略偏好（不含 profile_id） */
export interface ProfileDnsPolicyItem {
    dns_policy_id: string;
    preferred_server: string | null;
}

export interface Profile {
    id: string;
    name: string;
    type: 'remote' | 'local';
    url?: string;
    path?: string;
    selected: number;
    last_update: string;
    /** 更新间隔（秒），0 表示不自动更新 */
    updateInterval?: number;
    /** 记录此profile使用的rule provider IDs */
    usedRuleProviderIds?: string[];
    /** 订阅用户信息（流量、过期时间，从响应头 Subscription-Userinfo 解析） */
    subscriptionUserinfo?: SubscriptionUserinfo;
    /** 路由策略偏好（直接嵌入 profile） */
    policies?: ProfilePolicyItem[];
    /** DNS 策略偏好（直接嵌入 profile） */
    dnsPolicies?: ProfileDnsPolicyItem[];
}

/** @deprecated 使用 ProfilePolicyItem，保留用于兼容返回格式 */
export interface ProfilePolicy {
    profile_id: string;
    policy_id: string;
    preferred_outbounds: string[];
}

/** @deprecated 使用 ProfileDnsPolicyItem，保留用于兼容返回格式 */
export interface ProfileDnsPolicy {
    profile_id: string;
    dns_policy_id: string;
    preferred_server: string | null;
}

/** DNS 服务器表 */
export interface DnsServer {
    id: string;
    tag: string;
    type: string;
    order: number;
    /** 是否启用 */
    enabled: boolean;
    /** 是否为默认DNS服务器 */
    is_default: boolean;
    server?: string;
    server_port?: number;
    path?: string;
    detour?: string;
    prefer_go?: boolean;
    inet4_range?: string;
    inet6_range?: string;
    predefined?: Record<string, string | string[]>;
    [key: string]: unknown;
}

interface DbData {
    profiles: Profile[];
    settings: Record<string, string>;
    ruleProviders: RuleProvider[];
    policies: Policy[];
    dnsServers: DnsServer[];
    dnsPolicies: DnsPolicy[];
}

const defaultData: DbData = {
    profiles: [],
    settings: {},
    ruleProviders: [],
    policies: [],
    dnsServers: [],
    dnsPolicies: [],
};

function generateShortId(existingIds: Set<string>): string {
    let id = '';
    do {
        const timePart = Date.now().toString(36).slice(-4);
        const randomPart = Math.random().toString(36).slice(2, 6);
        id = `${timePart}${randomPart}`;
    } while (existingIds.has(id));
    return id;
}

/**
 * Format date to fixed format: "2026/3/12 17:27:54"
 * This ensures consistent format across all platforms (Windows, macOS, Linux)
 */
export function formatDateFixed(date: Date): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

/** 预分配一个未占用的短 id（不写入数据库），用于先下载后写入的场景 */
export function allocateId(): string {
    const data = loadDb();
    const existingIds = new Set([
        ...data.profiles.map((p) => String(p.id)),
        ...data.ruleProviders.map((p) => p.id),
    ]);
    return generateShortId(existingIds);
}

// getDbPath 和 ensureDir 现在由 paths.ts 模块统一管理

function loadDb(): DbData {
    getDataDir(); // 确保目录存在
    const dbPath = getDbPath();
    if (!fs.existsSync(dbPath)) {
        return { ...defaultData };
    }
    try {
        const raw = fs.readFileSync(dbPath, 'utf8');
        const data = JSON.parse(raw) as DbData;
        const profiles = (data.profiles ?? []).map((p: Profile & { id?: number | string }) => ({
            ...p,
            id: typeof p.id === 'number' ? String(p.id) : String(p.id ?? ''),
        }));

        const result: DbData = {
            profiles,
            settings: data.settings ?? {},
            ruleProviders: (data.ruleProviders ?? []).map((provider: RuleProvider) => ({
                ...provider,
                id: String(provider.id),
            })),
            policies: data.policies ?? [],
            dnsServers: data.dnsServers ?? [],
            dnsPolicies: data.dnsPolicies ?? [],
        };
        return result;
    } catch {
        return { ...defaultData };
    }
}

function saveDb(data: DbData) {
    getDataDir(); // 确保目录存在
    const dbPath = getDbPath();
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

function withDb<T>(fn: (data: DbData) => T): T {
    const data = loadDb();
    const result = fn(data);
    saveDb(data);
    return result;
}

export function getProfiles(): Profile[] {
    // 保持数据库中的顺序，避免更新订阅后卡片位置跳动
    return withDb((data) => [...data.profiles]);
}

export function addProfile(profile: { name: string; type: 'remote' | 'local'; url?: string; path?: string }, reservedId?: string): string {
    return withDb((data) => {
        const existingIds = new Set([
            ...data.profiles.map((p) => p.id),
            ...data.ruleProviders.map((p) => p.id),
        ]);
        const id = reservedId && !existingIds.has(reservedId) ? reservedId : generateShortId(existingIds);
        const now = new Date().toISOString();
        const pathRel = profile.path ? toDataRelativePath(profile.path) : undefined;
        data.profiles.push({
            id,
            name: profile.name,
            type: profile.type,
            url: profile.url,
            path: pathRel,
            selected: 0,
            last_update: now,
        });
        return id;
    });
}

export function deleteProfile(id: string) {
    withDb((data) => {
        data.profiles = data.profiles.filter((p) => p.id !== id);
    });
}

export function selectProfile(id: string) {
    withDb((data) => {
        data.profiles.forEach((p) => (p.selected = 0));
        const target = data.profiles.find((p) => p.id === id);
        if (target) target.selected = 1;
    });
}

export function getSetting(key: string, defaultValue?: string): string | undefined {
    const data = loadDb();
    return data.settings[key] ?? defaultValue;
}

export function setSetting(key: string, value: string) {
    withDb((data) => {
        data.settings[key] = value;
    });
}

// ===== DNS Servers 表 =====

export function getDnsServers(): DnsServer[] {
    return withDb((data) => [...(data.dnsServers ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
}

export function addDnsServer(server: Omit<DnsServer, 'id' | 'order'> & { order?: number }): string {
    return withDb((data) => {
        const dnsServers = data.dnsServers ?? [];
        const maxOrder = dnsServers.reduce((m, s) => Math.max(m, s.order ?? 0), -1);
        const tag = (typeof server.tag === 'string' ? server.tag : '').trim();
        if (!tag) throw new Error('DNS 服务器名称不能为空');
        const tags = new Set(dnsServers.map((s) => (s.tag || '').trim().toLowerCase()));
        if (tags.has(tag.toLowerCase())) throw new Error(`DNS 服务器名称 "${tag}" 已存在`);
        const id = tag;
        const newServer = {
            ...server,
            id,
            tag,
            order: server.order ?? maxOrder + 1,
            enabled: server.enabled ?? true,
            is_default: server.is_default ?? false,
        } as DnsServer;
        dnsServers.push(newServer);
        data.dnsServers = dnsServers;
        return id;
    });
}

export function updateDnsServer(id: string, updates: Partial<DnsServer>): void {
    withDb((data) => {
        const arr = data.dnsServers ?? [];
        const idx = arr.findIndex((s) => s.id === id);
        if (idx < 0) return;

        const server = arr[idx];
        const newTag = typeof updates.tag === 'string' ? updates.tag.trim() : undefined;
        const oldTag = (server.tag || '').trim();
        const oldId = server.id;

        // tag 变更时，id 同步更新为 newTag，并迁移所有引用
        if (newTag && newTag !== oldTag) {
            const newId = newTag;
            // 检查新 tag 是否已被其他服务器占用
            const conflict = arr.some((s, i) => i !== idx && ((s.tag || '').trim() === newTag || s.id === newId));
            if (conflict) {
                throw new Error(`DNS 服务器名称 "${newTag}" 已存在`);
            }

            // 更新服务器记录（id 与 tag 同步）
            arr[idx] = { ...server, ...updates, id: newId, tag: newTag };

            // 迁移 profile.dnsPolicies[].preferred_server
            for (const profile of data.profiles) {
                const items = profile.dnsPolicies ?? [];
                for (const p of items) {
                    if (p.preferred_server === oldId) p.preferred_server = newId;
                }
            }

            // 迁移 dnsPolicies.server（统一使用 id）
            const dnsPolicies = data.dnsPolicies ?? [];
            for (const p of dnsPolicies) {
                if ((p.server || '').trim() === oldId) p.server = newId;
            }

            // 迁移 policies（路由规则）中 raw_data.server（统一使用 id）
            const policies = data.policies ?? [];
            for (const p of policies) {
                const raw = (p as { raw_data?: { server?: string } }).raw_data;
                if (raw?.server && typeof raw.server === 'string' && raw.server.trim() === oldId) {
                    raw.server = newId;
                }
            }
        } else {
            // tag 未变更，仅应用其他字段（不允许通过 updates 修改 id）
            const { id: _unusedId, ...rest } = updates;
            arr[idx] = { ...server, ...rest };
        }
    });
}

export function deleteDnsServer(id: string): void {
    withDb((data) => {
        data.dnsServers = (data.dnsServers ?? []).filter((s) => s.id !== id);
    });
}

/**
 * 设置默认 DNS 服务器（将指定服务器的 is_default 设为 true，其他全部设为 false）
 * @param serverId DNS 服务器的 id（即 tag）
 * @returns 是否设置成功
 */
export function setDefaultDnsServer(serverId: string): boolean {
    return withDb((data) => {
        const dnsServers = data.dnsServers ?? [];
        const targetServer = dnsServers.find((s) => s.id === serverId || s.tag === serverId);
        if (!targetServer) return false;

        // 将所有服务器的 is_default 设为 false
        for (const s of dnsServers) {
            s.is_default = false;
        }
        // 将目标服务器的 is_default 设为 true
        targetServer.is_default = true;
        data.dnsServers = dnsServers;
        return true;
    });
}

/**
 * 清除默认 DNS 服务器（将所有服务器的 is_default 设为 false）
 */
export function clearDefaultDnsServer(): void {
    withDb((data) => {
        const dnsServers = data.dnsServers ?? [];
        for (const s of dnsServers) {
            s.is_default = false;
        }
        data.dnsServers = dnsServers;
    });
}

/**
 * 按 tag 作为 id 插入或更新 DNS 服务器（重复 tag 则覆盖）
 */
export function upsertDnsServerByTag(serverFromTemplate: Record<string, unknown>, order: number): string {
    const tag = serverFromTemplate?.tag;
    if (typeof tag !== 'string' || !tag.trim()) {
        throw new Error('DNS server must have a valid tag');
    }
    const id = tag;
    return withDb((data) => {
        let dnsServers = (data.dnsServers ?? []).filter((s) => s.tag !== tag && s.id !== id);
        const base: Partial<DnsServer> = {
            id,
            tag,
            type: (serverFromTemplate.type as string) || 'udp',
            order,
            enabled: true,
            is_default: false,
        };
        const extra: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(serverFromTemplate)) {
            if (!['tag', 'type', 'id'].includes(k) && v !== undefined) {
                extra[k] = v;
            }
        }
        const newServer = { ...base, ...extra } as DnsServer;
        dnsServers.push(newServer);
        data.dnsServers = dnsServers;
        return id;
    });
}

export function updateProfileDetails(id: string, name: string, url: string, updateInterval?: number) {
    withDb((data) => {
        const p = data.profiles.find((x) => x.id === id);
        if (p) {
            p.name = name;
            p.url = url;
            if (updateInterval !== undefined) {
                p.updateInterval = updateInterval;
            }
        }
    });
}

/**
 * 更新profile使用的rule provider引用记录
 */
export function updateProfileRuleProviderReferences(profileId: string): void {
    withDb((data) => {
        const profile = data.profiles.find((p: Profile) => p.id === profileId);
        if (!profile) return;
        
        // 获取此profile关联的所有策略
        const policyItems = profile.policies ?? [];
        const policyIds = new Set(policyItems.map((pp) => pp.policy_id));
        
        // 收集这些策略使用的所有rule provider IDs
        const ruleProviderIds = new Set<string>();
        for (const policy of data.policies) {
            if (policyIds.has(policy.id)) {
                const refs = getPolicyReferencedRuleProviderRefs(policy);
                refs.forEach(id => ruleProviderIds.add(id));
            }
        }
        
        // 更新profile的引用记录
        profile.usedRuleProviderIds = Array.from(ruleProviderIds);
    });
}

/**
 * 更新所有profile的rule provider引用记录
 */
export function updateAllProfileRuleProviderReferences(): void {
    withDb((data) => {
        for (const profile of data.profiles) {
            // 获取此profile关联的所有策略
            const policyItems = profile.policies ?? [];
            const policyIds = new Set(policyItems.map((pp) => pp.policy_id));
            
            // 收集这些策略使用的所有rule provider IDs
            const ruleProviderIds = new Set<string>();
            for (const policy of data.policies) {
                if (policyIds.has(policy.id)) {
                    const refs = getPolicyReferencedRuleProviderRefs(policy);
                    refs.forEach(id => ruleProviderIds.add(id));
                }
            }
            
            // 更新profile的引用记录
            profile.usedRuleProviderIds = Array.from(ruleProviderIds);
        }
    });
}

export function updateProfileContent(id: string, filePath: string, lastUpdate?: string) {
    withDb((data) => {
        const p = data.profiles.find((x) => x.id === id);
        if (p) {
            p.path = toDataRelativePath(filePath);
            p.last_update = lastUpdate ?? new Date().toISOString();
        }
    });
}

/**
 * 更新订阅用户信息（流量、过期时间，从 Subscription-Userinfo 响应头解析）
 */
export function updateProfileSubscriptionInfo(id: string, userinfo: SubscriptionUserinfo) {
    withDb((data) => {
        const p = data.profiles.find((x) => x.id === id);
        if (p) {
            p.subscriptionUserinfo = userinfo;
        }
    });
}

/**
 * 更新订阅配置的更新间隔
 * @param id Profile ID
 * @param updateInterval 更新间隔（秒），0 表示不自动更新
 */
export function updateProfileInterval(id: string, updateInterval: number) {
    withDb((data) => {
        const p = data.profiles.find((x) => x.id === id);
        if (p) {
            p.updateInterval = updateInterval;
        }
    });
}

export function getAllSettings(): Record<string, string> {
    const data = loadDb();
    return { ...data.settings };
}

export function getProfileById(id: string): Profile | undefined {
    const data = loadDb();
    return data.profiles.find((p) => p.id === id);
}

export function getSelectedProfile(): Profile | undefined {
    const data = loadDb();
    return data.profiles.find((p) => p.selected === 1);
}

/**
 * 获取所有需要自动更新的远程订阅配置
 * @returns 需要自动更新的 Profile 列表
 */
export function getAutoUpdateProfiles(): Profile[] {
    const data = loadDb();
    return data.profiles.filter(
        (p) => p.type === 'remote' && p.url && p.updateInterval && p.updateInterval > 0
    );
}

// ===== Rule Providers =====

export function getRuleProviders(): RuleProvider[] {
    return withDb((data) => [...data.ruleProviders].reverse());
}

export function getRuleProviderById(id: string): RuleProvider | undefined {
    return withDb((data) => data.ruleProviders.find((p) => p.id === id));
}

export function addRuleProvider(provider: Omit<RuleProvider, 'id'>, reservedId?: string): string {
    return withDb((data) => {
        const existingIds = new Set([
            ...data.profiles.map((p) => p.id),
            ...data.ruleProviders.map((p) => p.id),
        ]);
        const id = reservedId && !existingIds.has(reservedId) ? reservedId : generateShortId(existingIds);
        const p = { ...provider, id };
        if (p.path) p.path = toDataRelativePath(p.path);
        data.ruleProviders.push(p);
        return id;
    });
}

export function updateRuleProvider(id: string, updates: Partial<RuleProvider>) {
    withDb((data) => {
        const p = data.ruleProviders.find((x) => x.id === id);
        if (p) {
            Object.assign(p, updates);
        }
    });
}

export function deleteRuleProvider(id: string) {
    // 首先检查是否有引用
    const references = getRuleProviderReferences(id);
    if (references.policies.length > 0 || references.profiles.length > 0) {
        throw new Error(`无法删除规则集：被以下策略或配置引用 - 策略: ${references.policies.map(p => p.name).join(', ')}, 配置: ${references.profiles.map(p => p.name).join(', ')}`);
    }
    
    withDb((data) => {
        data.ruleProviders = data.ruleProviders.filter((p) => p.id !== id);
    });
}

/**
 * 获取策略引用的规则集ID
 */
export function getPolicyReferencedRuleProviderRefs(policy: Policy): string[] {
    const ruleSets = getPolicyRuleSet(policy);
    const refs: string[] = [];
    for (const item of ruleSets) {
        if (typeof item === 'string') {
            if (item.startsWith('acl:')) {
                refs.push(item.slice(4));
            } else if (!item.startsWith('geosite:') && !item.startsWith('geoip:')) {
                refs.push(item);
            }
        }
    }
    return refs;
}

/**
 * 检查规则集是否被任何启用的策略引用
 */
export function isRuleProviderUsedByEnabledPolicies(providerId: string): boolean {
    return withDb((data) => {
        const enabledPolicies = data.policies.filter((p: Policy) => p.enabled);
        return enabledPolicies.some((policy: Policy) => {
            const refs = getPolicyReferencedRuleProviderRefs(policy);
            return refs.includes(providerId);
        });
    });
}

/**
 * 获取所有引用指定规则集的策略信息
 */
export function getPoliciesReferencingRuleProvider(providerId: string): Array<{id: string, name: string}> {
    return withDb((data) => {
        return data.policies
            .filter((policy: Policy) => {
                const refs = getPolicyReferencedRuleProviderRefs(policy);
                return refs.includes(providerId);
            })
            .map((policy: Policy) => ({
                id: policy.id,
                name: policy.name
            }));
    });
}

/**
 * 获取规则集的所有引用信息（策略和profile）
 */
export function getRuleProviderReferences(providerId: string): {
    policies: Array<{id: string, name: string}>,
    profiles: Array<{id: string, name: string}>
} {
    return withDb((data) => {
        // 获取引用此规则集的策略
        const referencingPolicies = data.policies
            .filter((policy: Policy) => {
                const refs = getPolicyReferencedRuleProviderRefs(policy);
                return refs.includes(providerId);
            })
            .map((policy: Policy) => ({
                id: policy.id,
                name: policy.name
            }));
        
        // 获取包含这些策略的profile
        const relevantPolicyIds = new Set(referencingPolicies.map(p => p.id));
        const referencingProfiles = data.profiles
            .filter((p: Profile) => (p.policies ?? []).some((pp) => relevantPolicyIds.has(pp.policy_id)))
            .map((p: Profile) => ({ id: p.id, name: p.name }));
        
        return {
            policies: referencingPolicies,
            profiles: referencingProfiles as Array<{id: string, name: string}>
        };
    });
}

/**
 * 清空所有规则集
 */
export function clearRuleProviders(): void {
    withDb((data) => {
        data.ruleProviders = [];
    });
}

export function updateRuleProviderContent(id: string, filePath: string, lastUpdate?: string) {
    withDb((data) => {
        const p = data.ruleProviders.find((x) => x.id === id);
        if (p) {
            p.path = toDataRelativePath(filePath);
            p.last_update = lastUpdate ?? new Date().toISOString();
        }
    });
}

/**
 * 更新本地规则集的 raw_data 和 srs 文件路径
 */
export function updateLocalRuleProviderData(id: string, rawData: LocalRuleSetData, srsPath?: string) {
    withDb((data) => {
        const p = data.ruleProviders.find((x) => x.id === id);
        if (p) {
            p.raw_data = rawData;
            if (srsPath) {
                p.path = toDataRelativePath(srsPath);
            }
            p.last_update = new Date().toISOString();
        }
    });
}

/**
 * 添加本地类型的规则集
 */
export function addLocalRuleProvider(provider: Omit<RuleProvider, 'id'>, reservedId?: string): string {
    return withDb((data) => {
        const existingIds = new Set([
            ...data.profiles.map((p) => p.id),
            ...data.ruleProviders.map((p) => p.id),
        ]);
        const id = reservedId && !existingIds.has(reservedId) ? reservedId : generateShortId(existingIds);
        const p = { ...provider, id };
        if (p.path) p.path = toDataRelativePath(p.path);
        data.ruleProviders.push(p);
        return id;
    });
}

/**
 * 从预设添加或更新规则集（指定 id，用于导入时）
 * - id 不存在：添加新规则集
 * - id 已存在：用预设数据重写（保留 path、last_update 以不丢失本地缓存）
 * @param provider 规则集，必须包含 id
 * @returns 'added' | 'updated' | 'unchanged'（unchanged 表示预设无此 id）
 */
export function upsertRuleProviderFromPreset(provider: RuleProvider): 'added' | 'updated' | 'unchanged' {
    return withDb((data) => {
        const existing = data.ruleProviders.find(p => p.id === provider.id);
        const p = { ...provider };
        if (p.path) p.path = toDataRelativePath(p.path);
        if (existing) {
            Object.assign(existing, {
                name: p.name,
                url: p.url,
                type: p.type ?? 'clash',
                enabled: p.enabled !== false,
            });
            return 'updated';
        }
        data.ruleProviders.push(p);
        return 'added';
    });
}

/**
 * 从订阅解析添加或更新规则集
 * - id 使用订阅配置中的 key（规则集名称）
 * - id 已存在时完全覆盖（包括 path、last_update）
 * - 记录 profile_id 字段标识来源订阅
 * @param provider 规则集，必须包含 id
 * @returns 'added' | 'updated'
 */
export function upsertRuleProviderFromSubscription(provider: RuleProvider): 'added' | 'updated' {
    return withDb((data) => {
        const existingIndex = data.ruleProviders.findIndex(p => p.id === provider.id);
        const p = { ...provider };
        if (p.path) p.path = toDataRelativePath(p.path);
        
        if (existingIndex >= 0) {
            // 完全覆盖现有的记录
            data.ruleProviders[existingIndex] = p;
            return 'updated';
        }
        
        data.ruleProviders.push(p);
        return 'added';
    });
}

/**
 * 批量添加规则集（导入功能）
 * @param providers 规则集数组
 * @returns 成功添加的数量
 */
export function addRuleProvidersBatch(providers: Array<Omit<RuleProvider, 'id'>>): number {
    return withDb((data) => {
        let addedCount = 0;
        for (const provider of providers) {
            // 检查是否已存在相同 URL 的规则集
            const exists = data.ruleProviders.some(p => p.url === provider.url);
            if (!exists) {
                const existingIds = new Set(data.ruleProviders.map((p) => p.id));
                const id = generateShortId(existingIds);
                const p = { ...provider, id };
                if (p.path) p.path = toDataRelativePath(p.path);
                data.ruleProviders.push(p);
                addedCount++;
            }
        }
        return addedCount;
    });
}

// ===== Policies =====

export function getPolicies(): Policy[] {
    return withDb((data) => [...data.policies].sort((a, b) => a.order - b.order));
}

export function getPolicyById(id: string): Policy | undefined {
    return withDb((data) => data.policies.find((p) => p.id === id));
}

/** raw 类型策略写入前移除不应存储的字段 */
function sanitizeRawPolicy<T extends Record<string, unknown>>(obj: T): T {
    if ((obj as { type?: string }).type !== 'raw') return obj;
    const { ruleSet, ruleSetBuildIn, ruleSetAcl, outbound, ...rest } = obj;
    return rest as T;
}

export function addPolicy(policy: Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>): string {
    return withDb((data) => {
        const existingIds = new Set([
            ...data.policies.map((p) => p.id),
            ...data.profiles.map((p) => p.id),
            ...data.ruleProviders.map((p) => p.id),
        ]);
        const id = generateShortId(existingIds);
        const now = new Date().toISOString();
        const sanitized = sanitizeRawPolicy(policy as Record<string, unknown>);
        const newPolicy = {
            ...sanitized,
            id,
            createdAt: now,
            updatedAt: now,
        } as Policy;
        data.policies.push(newPolicy);
        
        // 自动更新所有profile的rule provider引用
        updateAllProfileRuleProviderReferences();
        
        return id;
    });
}

export function updatePolicy(id: string, updates: Partial<Omit<Policy, 'id' | 'createdAt'>>): void {
    withDb((data) => {
        const p = data.policies.find((x) => x.id === id);
        if (p) {
            const isRaw = (p as { type?: string }).type === 'raw' || (updates as { type?: string }).type === 'raw';
            let toApply: Partial<Omit<Policy, 'id' | 'createdAt'>> = updates;
            if (isRaw) {
                toApply = { ...updates };
                delete (toApply as Record<string, unknown>).ruleSet;
                delete (toApply as Record<string, unknown>).outbound;
            }
            Object.assign(p, toApply, { updatedAt: new Date().toISOString() });
        }
        
        // 策略更新后自动更新profile引用
        updateAllProfileRuleProviderReferences();
    });
}

export function deletePolicy(id: string): void {
    withDb((data) => {
        data.policies = data.policies.filter((p) => p.id !== id);
        
        // 策略删除后自动更新profile引用
        updateAllProfileRuleProviderReferences();
    });
}

/**
 * 批量添加策略（导入功能）
 * @param policies 策略数组
 * @param clearFirst 是否先清空现有策略（覆盖模式）
 * @returns 成功添加的数量
 */
export function addPoliciesBatch(policies: Array<Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>>, clearFirst?: boolean): number {
    return withDb((data) => {
        // 如果需要清空，先清空所有策略
        if (clearFirst) {
            data.policies = [];
        }
        let addedCount = 0;
        for (const policy of policies) {
            // 如果不是覆盖模式，检查是否已存在相同名称的策略
            if (!clearFirst) {
                const exists = data.policies.some(p => p.name === policy.name);
                if (exists) continue;
            }
            const existingIds = new Set([
                ...data.policies.map((p) => p.id),
                ...data.profiles.map((p) => p.id),
                ...data.ruleProviders.map((p) => p.id),
            ]);
            const id = generateShortId(existingIds);
            const now = new Date().toISOString();
            const sanitized = sanitizeRawPolicy(policy as Record<string, unknown>);
            data.policies.push({
                ...sanitized,
                id,
                createdAt: now,
                updatedAt: now,
            } as Policy);
            addedCount++;
        }
        return addedCount;
    });
}

/**
 * 更新策略排序
 * @param orders 策略 ID 和新顺序的映射
 */
export function updatePoliciesOrder(orders: Array<{ id: string; order: number }>): void {
    withDb((data) => {
        for (const { id, order } of orders) {
            const p = data.policies.find((x) => x.id === id);
            if (p) {
                p.order = order;
                p.updatedAt = new Date().toISOString();
            }
        }
    });
}

/**
 * 清空所有策略
 */
export function clearPolicies(): void {
    withDb((data) => {
        data.policies = [];
    });
}

// ===== Profile Policies =====

/** 返回所有 profile 的 policies 扁平列表（兼容旧 API） */
export function getProfilePolicies(): ProfilePolicy[] {
    return withDb((data) => {
        const result: ProfilePolicy[] = [];
        for (const profile of data.profiles) {
            for (const pp of profile.policies ?? []) {
                result.push({
                    profile_id: profile.id,
                    policy_id: pp.policy_id,
                    preferred_outbounds: pp.preferred_outbounds,
                });
            }
        }
        return result;
    });
}

export function getProfilePolicy(profileId: string): ProfilePolicy | undefined {
    return withDb((data) => {
        const profile = data.profiles.find((p) => p.id === profileId);
        const first = profile?.policies?.[0];
        return first ? { profile_id: profileId, policy_id: first.policy_id, preferred_outbounds: first.preferred_outbounds } : undefined;
    });
}

export function getProfilePolicyByPolicyId(profileId: string, policyId: string): ProfilePolicy | undefined {
    return withDb((data) => {
        const profile = data.profiles.find((p) => p.id === profileId);
        const item = profile?.policies?.find((pp) => pp.policy_id === policyId);
        return item ? { profile_id: profileId, policy_id: policyId, preferred_outbounds: item.preferred_outbounds } : undefined;
    });
}

export function setProfilePolicy(profileId: string, policyId: string, preferredOutbounds: string[]): void {
    withDb((data) => {
        const profile = data.profiles.find((p) => p.id === profileId);
        if (!profile) return;
        const policies = profile.policies ?? [];
        const idx = policies.findIndex((pp) => pp.policy_id === policyId);
        if (idx >= 0) {
            policies[idx].preferred_outbounds = preferredOutbounds;
        } else {
            policies.push({ policy_id: policyId, preferred_outbounds: preferredOutbounds });
        }
        profile.policies = policies;
    });
}

export function deleteProfilePolicy(profileId: string): void {
    withDb((data) => {
        const profile = data.profiles.find((p) => p.id === profileId);
        if (profile) profile.policies = [];
    });
}

/**
 * 清理无效的 profile.policies 条目
 * 移除 policy_id 不存在的条目
 */
export function cleanupProfilePolicies(): void {
    withDb((data) => {
        const validPolicyIds = new Set(data.policies.map((p) => p.id));
        let cleanedCount = 0;
        for (const profile of data.profiles) {
            const before = (profile.policies ?? []).length;
            profile.policies = (profile.policies ?? []).filter((pp) => validPolicyIds.has(pp.policy_id));
            cleanedCount += before - (profile.policies?.length ?? 0);
        }
        if (cleanedCount > 0) {
            console.log(`[DB] Cleaned up ${cleanedCount} invalid profile.policies entries`);
        }
    });
}

// ===== DNS Policies =====

export function getDnsPolicies(): DnsPolicy[] {
    return withDb((data) => [...data.dnsPolicies].sort((a, b) => a.order - b.order));
}

export function getDnsPolicyById(id: string): DnsPolicy | undefined {
    return withDb((data) => data.dnsPolicies.find((p) => p.id === id));
}

/** raw 类型策略写入前移除不应存储的字段（保留 server、name，仅移除表单冗余字段） */
function sanitizeRawDnsPolicy<T extends Record<string, unknown>>(obj: T): T {
    if ((obj as { type?: string }).type !== 'raw') return obj;
    const { ruleSet, ruleSetBuildIn, ruleSetAcl, ...rest } = obj;
    return rest as T;
}

export function addDnsPolicy(policy: Omit<DnsPolicy, 'id' | 'createdAt' | 'updatedAt'>): string {
    return withDb((data) => {
        const existingIds = new Set([
            ...data.policies.map((p) => p.id),
            ...data.dnsPolicies.map((p) => p.id),
            ...data.profiles.map((p) => p.id),
            ...data.ruleProviders.map((p) => p.id),
        ]);
        const id = generateShortId(existingIds);
        const now = new Date().toISOString();
        const sanitized = sanitizeRawDnsPolicy(policy as Record<string, unknown>);
        const newPolicy = {
            ...sanitized,
            id,
            createdAt: now,
            updatedAt: now,
        } as DnsPolicy;
        data.dnsPolicies.push(newPolicy);
        return id;
    });
}

export function updateDnsPolicy(id: string, updates: Partial<Omit<DnsPolicy, 'id' | 'createdAt'>>): void {
    withDb((data) => {
        const p = data.dnsPolicies.find((x) => x.id === id);
        if (p) {
            const isRaw = (p as { type?: string }).type === 'raw' || (updates as { type?: string }).type === 'raw';
            let toApply: Partial<Omit<DnsPolicy, 'id' | 'createdAt'>> = updates;
            if (isRaw) {
                toApply = { ...updates };
                delete (toApply as Record<string, unknown>).ruleSet;
                delete (toApply as Record<string, unknown>).server;
            }
            Object.assign(p, toApply, { updatedAt: new Date().toISOString() });
        }
    });
}

export function deleteDnsPolicy(id: string): void {
    withDb((data) => {
        data.dnsPolicies = data.dnsPolicies.filter((p) => p.id !== id);
    });
}

/**
 * 更新DNS策略排序
 */
export function updateDnsPoliciesOrder(orders: Array<{ id: string; order: number }>): void {
    withDb((data) => {
        for (const { id, order } of orders) {
            const p = data.dnsPolicies.find((x) => x.id === id);
            if (p) {
                p.order = order;
                p.updatedAt = new Date().toISOString();
            }
        }
    });
}

/**
 * 清空所有DNS策略
 */
export function clearDnsPolicies(): void {
    withDb((data) => {
        data.dnsPolicies = [];
    });
}

export interface DnsServerRef {
    source: 'dns' | 'route';
    index: number;
    name: string;
}

/** 返回引用指定 DNS 服务器 id 的规则列表（用于删除前校验，含具体规则#行号#名称） */
export function getDnsServerRefs(id: string): DnsServerRef[] {
    const t = (id || '').trim();
    if (!t) return [];
    const refs: DnsServerRef[] = [];
    const dnsPolicies = getDnsPolicies();
    for (const p of dnsPolicies) {
        const s = (p.server || '').trim();
        if (s === t) refs.push({ source: 'dns', index: (p.order ?? 0) + 1, name: p.name || `DNS 规则 ${(p.order ?? 0) + 1}` });
    }
    const policies = getPolicies();
    for (const p of policies) {
        const raw = (p as { raw_data?: { server?: string } }).raw_data;
        const s = raw?.server && typeof raw.server === 'string' ? raw.server.trim() : '';
        if (s === t) refs.push({ source: 'route', index: (p.order ?? 0) + 1, name: p.name || `规则 ${(p.order ?? 0) + 1}` });
    }
    return refs;
}

// ===== Profile DNS Policies =====

/** 返回所有 profile 的 dnsPolicies 扁平列表（兼容旧 API） */
export function getProfileDnsPolicies(): ProfileDnsPolicy[] {
    return withDb((data) => {
        const result: ProfileDnsPolicy[] = [];
        for (const profile of data.profiles) {
            for (const pp of profile.dnsPolicies ?? []) {
                result.push({
                    profile_id: profile.id,
                    dns_policy_id: pp.dns_policy_id,
                    preferred_server: pp.preferred_server,
                });
            }
        }
        return result;
    });
}

export function getProfileDnsPolicy(profileId: string): ProfileDnsPolicy | undefined {
    return withDb((data) => {
        const profile = data.profiles.find((p) => p.id === profileId);
        const first = profile?.dnsPolicies?.[0];
        return first ? { profile_id: profileId, dns_policy_id: first.dns_policy_id, preferred_server: first.preferred_server } : undefined;
    });
}

export function getProfileDnsPolicyByPolicyId(profileId: string, dnsPolicyId: string): ProfileDnsPolicy | undefined {
    return withDb((data) => {
        const profile = data.profiles.find((p) => p.id === profileId);
        const item = profile?.dnsPolicies?.find((pp) => pp.dns_policy_id === dnsPolicyId);
        return item ? { profile_id: profileId, dns_policy_id: dnsPolicyId, preferred_server: item.preferred_server } : undefined;
    });
}

export function setProfileDnsPolicy(profileId: string, dnsPolicyId: string, preferredServer: string | null): void {
    withDb((data) => {
        const profile = data.profiles.find((p) => p.id === profileId);
        if (!profile) return;
        const dnsPolicies = profile.dnsPolicies ?? [];
        const idx = dnsPolicies.findIndex((pp) => pp.dns_policy_id === dnsPolicyId);
        if (idx >= 0) {
            dnsPolicies[idx].preferred_server = preferredServer;
        } else {
            dnsPolicies.push({ dns_policy_id: dnsPolicyId, preferred_server: preferredServer });
        }
        profile.dnsPolicies = dnsPolicies;
    });
}

export function deleteProfileDnsPolicy(profileId: string): void {
    withDb((data) => {
        const profile = data.profiles.find((p) => p.id === profileId);
        if (profile) profile.dnsPolicies = [];
    });
}

/**
 * 清理无效的 profile.dnsPolicies 条目
 * 移除 dns_policy_id 不存在的条目
 */
export function cleanupProfileDnsPolicies(): void {
    withDb((data) => {
        const validDnsPolicyIds = new Set(data.dnsPolicies.map((p) => p.id));
        let cleanedCount = 0;
        for (const profile of data.profiles) {
            const before = (profile.dnsPolicies ?? []).length;
            profile.dnsPolicies = (profile.dnsPolicies ?? []).filter((pp) => validDnsPolicyIds.has(pp.dns_policy_id));
            cleanedCount += before - (profile.dnsPolicies?.length ?? 0);
        }
        if (cleanedCount > 0) {
            console.log(`[DB] Cleaned up ${cleanedCount} invalid profile.dnsPolicies entries`);
        }
    });
}
