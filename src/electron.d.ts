/** 自定义代理分组的单个分组配置 */
export interface CustomProxyGroup {
    /** 分组名称 */
    name: string;
    /** 分组类型：selector（手动选择）或 urltest（自动测速） */
    type: 'selector' | 'urltest';
    /** 分组包含的节点名称列表（对应订阅中的节点 tag） */
    outbounds: string[];
    /** 分组排序顺序 */
    order: number;
}

/** 代理节点信息（从订阅解析的真实节点，不包含分组） */
export interface ProxyNode {
    /** 节点名称/tag */
    name: string;
    /** 节点类型（如 shadowsocks, vmess, trojan 等） */
    type: string;
}

export interface ElectronAPI {
    ipcRenderer: {
        send(channel: string, ...args: any[]): void;
        on(channel: string, listener: (event: any, ...args: any[]) => void): void;
        off(channel: string, listener: (event: any, ...args: any[]) => void): void;
        invoke(channel: string, ...args: any[]): Promise<any>;
        db: {
            getProfiles(): Promise<any[]>;
            addProfile(profile: any): Promise<string>;
            deleteProfile(id: string): Promise<void>;
            selectProfile(id: string): Promise<void>;
            getSetting(key: string, defaultValue?: string): Promise<string | undefined>;
            setSetting(key: string, value: string): Promise<void>;
            setPolicyFinalOutbound(value: 'direct_out' | 'block_out' | 'selector_out'): Promise<void>;
            updateProfileDetails(id: string, name: string, url: string, updateInterval?: number): Promise<void>;
            updateProfileInterval(id: string, updateInterval: number): Promise<void>;
            updateProfileContent(id: string, content: string): Promise<void>;
            getProfileContent(id: string): Promise<string | null>;
            getAllSettings(): Promise<Record<string, string>>;
            // Rule Providers
            getRuleProviders(): Promise<any[]>;
            updateRuleProvider(id: string, updates: any): Promise<void>;
            deleteRuleProvider(id: string): Promise<void>;
            // Policies
            getPolicies(): Promise<any[]>;
            addPolicy(policy: any): Promise<string>;
            updatePolicy(id: string, updates: any): Promise<void>;
            deletePolicy(id: string): Promise<void>;
            addPoliciesBatch(policies: any[], clearFirst?: boolean): Promise<number>;
            updatePoliciesOrder(orders: Array<{ id: string; order: number }>): Promise<void>;
            // Profile Policies
            getProfilePolicyByPolicyId(profileId: string, policyId: string): Promise<any>;
            setProfilePolicy(profileId: string, policyId: string, preferredOutbound: string | null): Promise<void>;
            // DNS Policies
            getDnsPolicies(): Promise<any[]>;
            addDnsPolicy(policy: any): Promise<string>;
            updateDnsPolicy(id: string, updates: any): Promise<void>;
            deleteDnsPolicy(id: string): Promise<void>;
            updateDnsPoliciesOrder(orders: Array<{ id: string; order: number }>): Promise<void>;
            getDnsServers(): Promise<any[]>;
            getDnsServerRefs(tag: string): Promise<Array<{ source: 'dns' | 'route' | 'dns_server'; index: number; name: string }>>;
            addDnsServer(server: any): Promise<string>;
            updateDnsServer(id: string, updates: any): Promise<void>;
            deleteDnsServer(id: string): Promise<void>;
            toggleDnsServerEnabled(id: string, enabled: boolean): Promise<boolean>;
            setDefaultDnsServer(id: string): Promise<boolean>;
            // Profile DNS Policies
            getProfileDnsPolicyByPolicyId(profileId: string, dnsPolicyId: string): Promise<any>;
            setProfileDnsPolicy(profileId: string, dnsPolicyId: string, dnsServerId: string | null): Promise<void>;
            // Profile DNS Server Detours
            getProfileDnsServerDetour(profileId: string, dnsServerId: string): Promise<string | null>;
            setProfileDnsServerDetour(profileId: string, dnsServerId: string, detour: string | null): Promise<void>;
            getAllProfileDnsServerDetours(profileId: string): Promise<Array<{ dns_server_id: string; preferred_detour: string | null }>>;
            // Custom Proxy Groups
            getProfileCustomGroups(profileId: string): Promise<CustomProxyGroup[]>;
            setProfileCustomGroups(profileId: string, groups: CustomProxyGroup[]): Promise<void>;
            addProfileCustomGroup(profileId: string, group: Omit<CustomProxyGroup, 'order'>): Promise<void>;
            updateProfileCustomGroup(profileId: string, groupName: string, updates: Partial<Omit<CustomProxyGroup, 'name'>>): Promise<void>;
            deleteProfileCustomGroup(profileId: string, groupName: string): Promise<void>;
            updateProfileCustomGroupsOrder(profileId: string, orders: Array<{ name: string; order: number }>): Promise<void>;
            clearProfileCustomGroups(profileId: string): Promise<void>;
            getProfileNodes(profileId: string): Promise<ProxyNode[]>;
            setTunModeWithConfigGeneration(key: string, value: string): Promise<void>;
        };
        core: {
            start(): Promise<boolean>;
            stop(): Promise<void>;
            restart(): Promise<boolean>;
            isRunning(): Promise<boolean>;
            getStartTime(): Promise<number | null>;
            setSystemProxy(enable: boolean): Promise<void>;
            getSystemProxyStatus(): Promise<boolean>;
            setAutoLaunch(enable: boolean): Promise<void>;
            getAutoLaunch(): Promise<boolean>;
            updateProfile(profileId: string): Promise<string>;
            addSubscriptionProfile(url: string): Promise<string>;
            importLocalProfile(): Promise<string | null>;
            openUserDataPath(): Promise<void>;
            openExternalUrl(url: string): Promise<void>;
            getActiveConfig(): Promise<any>;
            generateConfig(): Promise<string>;
            getSelectedProfile(): Promise<{ profile: any; config: any } | null>;
            isServiceInstalled(): Promise<boolean>;
            isLauncherTaskInstalled(): Promise<boolean>;
            isLauncherAvailable(): Promise<boolean>;
            installLauncherTask(): Promise<{ success: boolean; error?: string; needsRestart?: boolean }>;
            uninstallLauncherTask(): Promise<{ success: boolean; error?: string; needsRestart?: boolean }>;
            runLauncherTaskNow(): Promise<{ success: boolean; error?: string }>;
            updateTrayMenu(): Promise<void>;
            getCurrentConfigRules(): Promise<any[]>;
            getBuildInfo(): Promise<{ appVersion: string; singboxVersion: string; buildTime: string; buildNumber: string; commitSha: string }>;
            downloadRuleProvider(providerId: string): Promise<{ success: boolean; path: string }>;
            getRuleProviderViewContent(providerId: string): Promise<{ content: string | null; error: string | null }>;
            // Rule Provider Save (unified)
            saveRuleProvider(provider: { id?: string; name: string; url?: string; type: RuleProviderType; enabled?: boolean; rules?: import('./types/singbox').HeadlessRule[]; logical_rule?: import('./types/singbox').RouteLogicRule }): Promise<void>;
            // Templates & Policies
            getTemplates(): Promise<Array<{ name: string; description: string; path: string }>>;
            getTemplatePolicies(templatePath: string): Promise<{ rules: any[]; dns?: any; rule_unmatched_outbound?: string }>;
            importTemplateComplete(templatePath: string): Promise<{ success: boolean; message: string; addedCount: number; presetResult?: { added: number; updated: number }; dnsSet?: boolean; finalOutboundSet?: boolean; finalOutbound?: string; tunSet?: boolean; tunNeedsAdmin?: boolean; tunValue?: boolean; defaultDnsServerSet?: boolean }>;
            getPresetRulesets(): Promise<Array<{ id: string; name: string; url: string; type?: string; interval?: number; path?: string; enabled: boolean }>>;
            getAllRuleSetsGrouped(): Promise<Array<{ groupKey: string; displayName: string; items: Array<{ id: string; name: string; url: string; type?: string; path?: string; enabled: boolean }> }>>;
            addRuleProvidersFromPreset(aclIds: string[]): Promise<{ added: number; updated: number }>;
            getAvailableOutbounds(): Promise<Array<{ tag: string; type: string; all?: string[] }>>;
            /** 通过 selector_out 代理检测出口 IP（内核运行时） */
            fetchIpThroughProxy(): Promise<{ ip: string; country: string; countryCode: string } | null>;
            /** 直连检测出口 IP（内核未启动时） */
            fetchIpDirect(): Promise<{ ip: string; country: string; countryCode: string } | null>;
        };
        config: {
            export(): Promise<{ ok: boolean; path: string | null }>;
            import(): Promise<{ ok: boolean }>;
        };
        logger: {
            getLogDir(): Promise<string>;
            getLogFiles(): Promise<string[]>;
            clearAllLogs(): Promise<void>;
            log(level: string, module: string, message: string): Promise<void>;
            logBatch(entries: Array<{ level: string; module: string; message: string }>): Promise<void>;
        };
        singbox: {
            getInitialLogLineCount(): Promise<{ lineCount: number }>;
            readLog(options?: { fromLine?: number; search?: string; maxResults?: number }): Promise<{ lines: string[]; totalLines: number; isSearch?: boolean }>;
            clearLog(): Promise<{ success: boolean; error?: string }>;
        };
        /** RoverService APIs (macOS and Windows) */
        roverservice: {
            getInstallationStatus(): Promise<{
                platform: string;
                supported: boolean;
                socketAvailable: boolean;
                binaryInstalled: boolean;
                serviceLoaded: boolean;
                running: boolean;
                pid?: number;
                version?: string;
            }>;
            install(): Promise<{ success: boolean; error?: string; isUserCanceled?: boolean }>;
            uninstall(): Promise<{ success: boolean; error?: string; isUserCanceled?: boolean }>;
        };
        onConfigGenerateStart(callback: () => void): () => void;
        onConfigGenerateEnd(callback: () => void): () => void;
        onConfigImportStep(callback: (step: string) => void): () => void;
    };
}

declare global {
    interface Window extends ElectronAPI { }
}
