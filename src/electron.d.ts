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
            setProfilePolicy(profileId: string, policyId: string, preferredOutbounds: string[]): Promise<void>;
            // DNS Policies
            getDnsPolicies(): Promise<any[]>;
            addDnsPolicy(policy: any): Promise<string>;
            updateDnsPolicy(id: string, updates: any): Promise<void>;
            deleteDnsPolicy(id: string): Promise<void>;
            updateDnsPoliciesOrder(orders: Array<{ id: string; order: number }>): Promise<void>;
            getDnsServers(): Promise<any[]>;
            getDnsServerRefs(tag: string): Promise<Array<{ source: 'dns' | 'route'; index: number; name: string }>>;
            addDnsServer(server: any): Promise<string>;
            updateDnsServer(id: string, updates: any): Promise<void>;
            deleteDnsServer(id: string): Promise<void>;
            // Profile DNS Policies
            getProfileDnsPolicyByPolicyId(profileId: string, dnsPolicyId: string): Promise<any>;
            setProfileDnsPolicy(profileId: string, dnsPolicyId: string, dnsServerId: string | null): Promise<void>;
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
            addRuleProviderWithDownload(provider: { name: string; url: string; type?: string; enabled?: boolean }): Promise<string>;
            getRuleProviderViewContent(providerId: string): Promise<{ content: string | null; error: string | null }>;
            // Local Rule Provider
            addLocalRuleProvider(provider: { name: string; enabled?: boolean }): Promise<string>;
            saveLocalRuleProvider(providerId: string, rawData: import('./types/rule-providers').LocalRuleSetData): Promise<{ success: boolean; srsPath: string }>;
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
            readLog(options?: { fromLine?: number }): Promise<{ lines: string[]; totalLines: number }>;
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
            install(helperPath?: string): Promise<{ success: boolean; error?: string; isUserCanceled?: boolean }>;
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
