import fs from 'node:fs';
import path from 'node:path';
import { getDbPath, getDataDir, getProfilesDir, toDataRelativePath } from './paths';
import type { RuleProvider } from '../src/types/rule-providers';
import type { Policy } from '../src/types/policy';

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
}

export interface ProfilePolicy {
    profile_id: string;
    policy_id: string;
    preferred_outbounds: string[];
}

interface DbData {
    profiles: Profile[];
    settings: Record<string, string>;
    ruleProviders: RuleProvider[];
    policies: Policy[];
    profilePolicies: ProfilePolicy[];
    nextId: number;
    nextProviderId: number;
}

const defaultData: DbData = {
    profiles: [],
    settings: {},
    ruleProviders: [],
    policies: [],
    profilePolicies: [],
    nextId: 1,
    nextProviderId: 1,
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
        return {
            profiles,
            settings: data.settings ?? {},
            ruleProviders: (data.ruleProviders ?? []).map((provider: RuleProvider) => ({
                ...provider,
                id: String(provider.id),
            })),
            policies: data.policies ?? [],
            profilePolicies: data.profilePolicies ?? [],
            nextId: data.nextId ?? 1,
            nextProviderId: data.nextProviderId ?? 1,
        };
    } catch {
        return { ...defaultData };
    }
}

/**
 * 将旧的数字型 profile id 迁移为规则集同款的短 id（字符串）
 */
export function migrateProfileIdsToShortId(): void {
    const data = loadDb();
    const profilesDir = getProfilesDir();
    const existingIds = new Set<string>([
        ...data.profiles.map((p) => String(p.id)),
        ...data.ruleProviders.map((p) => p.id),
    ]);
    let migrated = false;
    for (const profile of data.profiles) {
        const idStr = String(profile.id);
        const isNumericId = /^\d+$/.test(idStr);
        if (!isNumericId) continue;
        const newId = generateShortId(existingIds);
        existingIds.add(newId);
        const oldPath = path.join(profilesDir, `profile_${profile.id}`);
        const newPath = path.join(profilesDir, `profile_${newId}`);
        if (fs.existsSync(oldPath)) {
            fs.renameSync(oldPath, newPath);
        }
        profile.id = newId;
        if (profile.path) {
            profile.path = `profiles/profile_${newId}`;
        }
        migrated = true;
    }
    if (migrated) {
        saveDb(data);
    }
}

/** 将数据库中的绝对路径迁移为相对路径 */
export function migratePathsToRelative(): void {
    const data = loadDb();
    let changed = false;
    for (const p of data.profiles) {
        if (p.path && path.isAbsolute(p.path)) {
            const rel = toDataRelativePath(p.path);
            if (rel !== p.path) {
                p.path = rel;
                changed = true;
            }
        }
    }
    for (const p of data.ruleProviders) {
        if (p.path && path.isAbsolute(p.path)) {
            const rel = toDataRelativePath(p.path);
            if (rel !== p.path) {
                p.path = rel;
                changed = true;
            }
        }
    }
    if (changed) saveDb(data);
}

/** 将规则集文件名从 provider_ 前缀迁移为 ruleset_ 前缀 */
export function migrateRuleProviderFilePrefix(): void {
    const data = loadDb();
    const dataDir = getDataDir();
    let changed = false;

    for (const p of data.ruleProviders) {
        if (!p.path || !p.path.includes('provider_')) continue;
        const newPath = p.path.replace(/rulesets\/provider_/g, 'rulesets/ruleset_');
        if (newPath === p.path) continue;

        const oldFull = path.join(dataDir, p.path);
        const newFull = path.join(dataDir, newPath);
        if (fs.existsSync(oldFull)) {
            try {
                fs.renameSync(oldFull, newFull);
            } catch (_) { /* 文件可能被占用，跳过 */ }
        }
        for (const ext of ['.list', '.srs']) {
            const oldExt = oldFull.replace(/\.(json|list|srs)$/i, ext);
            const newExt = newFull.replace(/\.(json|list|srs)$/i, ext);
            if (oldExt !== oldFull && fs.existsSync(oldExt)) {
                try {
                    fs.renameSync(oldExt, newExt);
                } catch (_) { /* ignore */ }
            }
        }
        p.path = newPath;
        changed = true;
    }
    if (changed) saveDb(data);
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
        const profilePolicies = data.profilePolicies.filter((pp: ProfilePolicy) => pp.profile_id === profileId);
        const policyIds = new Set(profilePolicies.map((pp: ProfilePolicy) => pp.policy_id));
        
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
            const profilePolicies = data.profilePolicies.filter((pp: ProfilePolicy) => pp.profile_id === profile.id);
            const policyIds = new Set(profilePolicies.map((pp: ProfilePolicy) => pp.policy_id));
            
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
    const rawRuleSets = policy.ruleSetBuildIn ?? [];
    const aclRuleSets = policy.ruleSetAcl ?? [];
    
    const refs: string[] = [];
    
    // 从ruleSetBuildIn中提取acl:前缀的规则集ID
    for (const item of rawRuleSets) {
        if (typeof item === 'string') {
            if (item.startsWith('acl:')) {
                refs.push(item.slice(4));
            } else if (!item.startsWith('geosite:') && !item.startsWith('geoip:')) {
                // 没有前缀的认为是自定义规则集ID
                refs.push(item);
            }
        }
    }
    
    // 从ruleSetAcl中添加自定义规则集ID
    refs.push(...aclRuleSets.filter(id => typeof id === 'string'));
    
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
        const referencingProfiles = data.profilePolicies
            .filter((pp: ProfilePolicy) => relevantPolicyIds.has(pp.policy_id))
            .map((pp: ProfilePolicy) => {
                const profile = data.profiles.find((p: Profile) => p.id === pp.profile_id);
                return profile ? { id: profile.id, name: profile.name } : null;
            })
            .filter(Boolean);
        
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
 * 迁移数据库中的时间格式为标准ISO格式
 * 用于将原有的formatDateFixed格式转换为ISO格式
 */
export function migrateDateTimeFormats() {
    withDb((data) => {
        let migratedCount = 0;
        
        // 迁移profiles的last_update字段
        data.profiles.forEach((profile) => {
            if (profile.last_update && !profile.last_update.includes('T')) {
                try {
                    // 尝试解析原有的固定格式并转换为ISO格式
                    const date = new Date(profile.last_update);
                    if (!isNaN(date.getTime())) {
                        profile.last_update = date.toISOString();
                        migratedCount++;
                    }
                } catch (e) {
                    console.warn(`Failed to migrate profile ${profile.id} last_update:`, e);
                }
            }
        });
        
        // 迁移ruleProviders的last_update字段
        data.ruleProviders.forEach((provider) => {
            if (provider.last_update && !provider.last_update.includes('T')) {
                try {
                    // 尝试解析原有的固定格式并转换为ISO格式
                    const date = new Date(provider.last_update);
                    if (!isNaN(date.getTime())) {
                        provider.last_update = date.toISOString();
                        migratedCount++;
                    }
                } catch (e) {
                    console.warn(`Failed to migrate rule provider ${provider.id} last_update:`, e);
                }
            }
        });
        
        console.log(`Database migration completed: migrated ${migratedCount} time fields to ISO format`);
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
    const { ruleSetBuildIn, outbound, ...rest } = obj;
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
                delete (toApply as Record<string, unknown>).ruleSetBuildIn;
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

export function getProfilePolicies(): ProfilePolicy[] {
    return withDb((data) => [...data.profilePolicies]);
}

export function getProfilePolicy(profileId: string): ProfilePolicy | undefined {
    return withDb((data) => data.profilePolicies.find((p) => p.profile_id === profileId));
}

export function getProfilePolicyByPolicyId(profileId: string, policyId: string): ProfilePolicy | undefined {
    return withDb((data) => data.profilePolicies.find((p) => p.profile_id === profileId && p.policy_id === policyId));
}

export function setProfilePolicy(profileId: string, policyId: string, preferredOutbounds: string[]): void {
    withDb((data) => {
        const existingIndex = data.profilePolicies.findIndex((p) => p.profile_id === profileId && p.policy_id === policyId);
        if (existingIndex >= 0) {
            data.profilePolicies[existingIndex].preferred_outbounds = preferredOutbounds;
        } else {
            data.profilePolicies.push({
                profile_id: profileId,
                policy_id: policyId,
                preferred_outbounds: preferredOutbounds,
            });
        }
    });
}

export function deleteProfilePolicy(profileId: string): void {
    withDb((data) => {
        data.profilePolicies = data.profilePolicies.filter((p) => p.profile_id !== profileId);
    });
}

/**
 * 清理无效的 profilePolicies 条目
 * 移除 profile_id 或 policy_id 不存在的条目
 */
export function cleanupProfilePolicies(): void {
    withDb((data) => {
        const validProfileIds = new Set(data.profiles.map((p) => p.id));
        const validPolicyIds = new Set(data.policies.map((p) => p.id));
        
        const before = data.profilePolicies.length;
        data.profilePolicies = data.profilePolicies.filter((pp) => {
            return validProfileIds.has(pp.profile_id) && validPolicyIds.has(pp.policy_id);
        });
        const after = data.profilePolicies.length;
        
        if (before !== after) {
            console.log(`[DB] Cleaned up ${before - after} invalid profilePolicies entries`);
        }
    });
}
