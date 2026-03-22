import { contextBridge, ipcRenderer } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
    on(...args: Parameters<typeof ipcRenderer.on>) {
        const [channel, listener] = args
        return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
    },
    off(...args: Parameters<typeof ipcRenderer.off>) {
        const [channel, listener] = args
        return ipcRenderer.off(channel, listener)
    },
    send(...args: Parameters<typeof ipcRenderer.send>) {
        const [channel, ...data] = args
        return ipcRenderer.send(channel, ...data)
    },
    invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
        const [channel, ...data] = args
        return ipcRenderer.invoke(channel, ...data)
    },

    // Database APIs
    db: {
        getProfiles: () => ipcRenderer.invoke('db:getProfiles'),
        addProfile: (profile: any) => ipcRenderer.invoke('db:addProfile', profile),
        deleteProfile: (id: string) => ipcRenderer.invoke('db:deleteProfile', id),
        selectProfile: (id: string) => ipcRenderer.invoke('db:selectProfile', id),
        getSetting: (key: string, defaultValue?: string) => ipcRenderer.invoke('db:getSetting', key, defaultValue),
        setSetting: (key: string, value: string) => ipcRenderer.invoke('db:setSetting', key, value),
        setPolicyFinalOutbound: (value: 'direct_out' | 'block_out' | 'selector_out') => ipcRenderer.invoke('db:setPolicyFinalOutbound', value),
        updateProfileDetails: (id: string, name: string, url: string, updateInterval?: number) => ipcRenderer.invoke('db:updateProfileDetails', id, name, url, updateInterval),
        updateProfileInterval: (id: string, updateInterval: number) => ipcRenderer.invoke('db:updateProfileInterval', id, updateInterval),
        updateProfileContent: (id: string, content: string) => ipcRenderer.invoke('db:updateProfileContent', id, content),
        getProfileContent: (id: string) => ipcRenderer.invoke('db:getProfileContent', id),
        getAllSettings: () => ipcRenderer.invoke('db:getAllSettings'),
        // Rule Providers
        getRuleProviders: () => ipcRenderer.invoke('db:getRuleProviders'),
        updateRuleProvider: (id: string, updates: any) => ipcRenderer.invoke('db:updateRuleProvider', id, updates),
        deleteRuleProvider: (id: string) => ipcRenderer.invoke('db:deleteRuleProvider', id),
        // Policies
        getPolicies: () => ipcRenderer.invoke('db:getPolicies'),
        addPolicy: (policy: any) => ipcRenderer.invoke('db:addPolicy', policy),
        updatePolicy: (id: string, updates: any) => ipcRenderer.invoke('db:updatePolicy', id, updates),
        deletePolicy: (id: string) => ipcRenderer.invoke('db:deletePolicy', id),
        addPoliciesBatch: (policies: any[], clearFirst?: boolean) => ipcRenderer.invoke('db:addPoliciesBatch', policies, clearFirst),
        updatePoliciesOrder: (orders: Array<{ id: string; order: number }>) => ipcRenderer.invoke('db:updatePoliciesOrder', orders),
        // Profile Policies
        getProfilePolicyByPolicyId: (profileId: string, policyId: string) => ipcRenderer.invoke('db:getProfilePolicyByPolicyId', profileId, policyId),
        setProfilePolicy: (profileId: string, policyId: string, preferredOutbounds: string[]) => ipcRenderer.invoke('db:setProfilePolicy', profileId, policyId, preferredOutbounds),
        // DNS Policies
        getDnsPolicies: () => ipcRenderer.invoke('db:getDnsPolicies'),
        addDnsPolicy: (policy: any) => ipcRenderer.invoke('db:addDnsPolicy', policy),
        updateDnsPolicy: (id: string, updates: any) => ipcRenderer.invoke('db:updateDnsPolicy', id, updates),
        deleteDnsPolicy: (id: string) => ipcRenderer.invoke('db:deleteDnsPolicy', id),
        updateDnsPoliciesOrder: (orders: Array<{ id: string; order: number }>) => ipcRenderer.invoke('db:updateDnsPoliciesOrder', orders),
        getDnsServers: () => ipcRenderer.invoke('db:getDnsServers'),
        getDnsServerRefs: (tag: string) => ipcRenderer.invoke('db:getDnsServerRefs', tag),
        addDnsServer: (server: any) => ipcRenderer.invoke('db:addDnsServer', server),
        updateDnsServer: (id: string, updates: any) => ipcRenderer.invoke('db:updateDnsServer', id, updates),
        deleteDnsServer: (id: string) => ipcRenderer.invoke('db:deleteDnsServer', id),
        // Profile DNS Policies
        getProfileDnsPolicyByPolicyId: (profileId: string, dnsPolicyId: string) => ipcRenderer.invoke('db:getProfileDnsPolicyByPolicyId', profileId, dnsPolicyId),
        setProfileDnsPolicy: (profileId: string, dnsPolicyId: string, dnsServerId: string | null) => ipcRenderer.invoke('db:setProfileDnsPolicy', profileId, dnsPolicyId, dnsServerId),
        // Profile DNS Server Detours
        getProfileDnsServerDetour: (profileId: string, dnsServerId: string) => ipcRenderer.invoke('db:getProfileDnsServerDetour', profileId, dnsServerId),
        setProfileDnsServerDetour: (profileId: string, dnsServerId: string, detour: string | null) => ipcRenderer.invoke('db:setProfileDnsServerDetour', profileId, dnsServerId, detour),
        getAllProfileDnsServerDetours: (profileId: string) => ipcRenderer.invoke('db:getAllProfileDnsServerDetours', profileId),
        // Custom Proxy Groups
        getProfileCustomGroups: (profileId: string) => ipcRenderer.invoke('db:getProfileCustomGroups', profileId),
        setProfileCustomGroups: (profileId: string, groups: any[]) => ipcRenderer.invoke('db:setProfileCustomGroups', profileId, groups),
        addProfileCustomGroup: (profileId: string, group: any) => ipcRenderer.invoke('db:addProfileCustomGroup', profileId, group),
        updateProfileCustomGroup: (profileId: string, groupName: string, updates: any) => ipcRenderer.invoke('db:updateProfileCustomGroup', profileId, groupName, updates),
        deleteProfileCustomGroup: (profileId: string, groupName: string) => ipcRenderer.invoke('db:deleteProfileCustomGroup', profileId, groupName),
        updateProfileCustomGroupsOrder: (profileId: string, orders: any[]) => ipcRenderer.invoke('db:updateProfileCustomGroupsOrder', profileId, orders),
        clearProfileCustomGroups: (profileId: string) => ipcRenderer.invoke('db:clearProfileCustomGroups', profileId),
        getProfileNodes: (profileId: string) => ipcRenderer.invoke('db:getProfileNodes', profileId),
        setTunModeWithConfigGeneration: (key: string, value: string) => ipcRenderer.invoke('db:setTunModeWithConfigGeneration', key, value),
    },

    // Sing-box APIs
    core: {
        start: () => ipcRenderer.invoke('core:start'),
        stop: () => ipcRenderer.invoke('core:stop'),
        restart: () => ipcRenderer.invoke('core:restart'),
        isRunning: () => ipcRenderer.invoke('core:isRunning'),
        getStartTime: () => ipcRenderer.invoke('core:getStartTime'),
        setSystemProxy: (enable: boolean) => ipcRenderer.invoke('core:setSystemProxy', enable),
        getSystemProxyStatus: () => ipcRenderer.invoke('core:getSystemProxyStatus'),
        setAutoLaunch: (enable: boolean) => ipcRenderer.invoke('core:setAutoLaunch', enable),
        getAutoLaunch: () => ipcRenderer.invoke('core:getAutoLaunch'),
        updateProfile: (profileId: string) => ipcRenderer.invoke('core:updateProfile', profileId),
        addSubscriptionProfile: (url: string) => ipcRenderer.invoke('core:addSubscriptionProfile', url),
        importLocalProfile: () => ipcRenderer.invoke('core:importLocalProfile'),
        openUserDataPath: () => ipcRenderer.invoke('core:openUserDataPath'),
        openExternalUrl: (url: string) => ipcRenderer.invoke('core:openExternalUrl', url),
        getActiveConfig: () => ipcRenderer.invoke('core:getActiveConfig'),
        generateConfig: () => ipcRenderer.invoke('core:generateConfig'),
        getSelectedProfile: () => ipcRenderer.invoke('core:getSelectedProfile'),
        isServiceInstalled: () => ipcRenderer.invoke('core:isServiceInstalled'),
        updateTrayMenu: () => ipcRenderer.invoke('core:updateTrayMenu'),
        getCurrentConfigRules: () => ipcRenderer.invoke('core:getCurrentConfigRules'),
        getBuildInfo: () => ipcRenderer.invoke('core:getBuildInfo'),
        downloadRuleProvider: (providerId: string) => ipcRenderer.invoke('core:downloadRuleProvider', providerId),
        getRuleProviderViewContent: (providerId: string) => ipcRenderer.invoke('core:getRuleProviderViewContent', providerId),
        // Rule Provider Save (unified)
        saveRuleProvider: (provider: { id?: string; name: string; url?: string; type: string; enabled?: boolean; rules?: any[] }) => ipcRenderer.invoke('core:saveRuleProvider', provider),
        // Templates & Policies
        getTemplates: () => ipcRenderer.invoke('core:getTemplates'),
        getTemplatePolicies: (templatePath: string) => ipcRenderer.invoke('core:getTemplatePolicies', templatePath),
        importTemplateComplete: (templatePath: string) => ipcRenderer.invoke('core:importTemplateComplete', templatePath),
        getPresetRulesets: () => ipcRenderer.invoke('core:getPresetRulesets'),
        getAllRuleSetsGrouped: () => ipcRenderer.invoke('core:getAllRuleSetsGrouped'),
        addRuleProvidersFromPreset: (aclIds: string[]) => ipcRenderer.invoke('core:addRuleProvidersFromPreset', aclIds),
        getAvailableOutbounds: () => ipcRenderer.invoke('core:getAvailableOutbounds'),
        fetchIpThroughProxy: () => ipcRenderer.invoke('core:fetchIpThroughProxy'),
        fetchIpDirect: () => ipcRenderer.invoke('core:fetchIpDirect'),
    },

    // 配置导出/导入
    config: {
        export: () => ipcRenderer.invoke('config:export'),
        import: () => ipcRenderer.invoke('config:import'),
    },

    // Sing-box 内核日志（本地文件）
    singbox: {
        getInitialLogLineCount: () => ipcRenderer.invoke('singbox:getInitialLogLineCount'),
        readLog: (options?: { fromLine?: number; search?: string; maxResults?: number }) => ipcRenderer.invoke('singbox:readLog', options),
        clearLog: () => ipcRenderer.invoke('singbox:clearLog'),
    },

    // Event listeners for main -> renderer communication
    onConfigGenerateStart: (callback: () => void) => {
        ipcRenderer.on('config-generate-start', callback);
        return () => ipcRenderer.off('config-generate-start', callback);
    },
    onConfigGenerateEnd: (callback: () => void) => {
        ipcRenderer.on('config-generate-end', callback);
        return () => ipcRenderer.off('config-generate-end', callback);
    },
    onConfigImportStep: (callback: (step: string) => void) => {
        const handler = (_: any, step: string) => callback(step);
        ipcRenderer.on('config-import-step', handler);
        return () => ipcRenderer.off('config-import-step', handler);
    },

    // Logger APIs
    logger: {
        getLogDir: () => ipcRenderer.invoke('logger:getLogDir'),
        getLogFiles: () => ipcRenderer.invoke('logger:getLogFiles'),
        clearAllLogs: () => ipcRenderer.invoke('logger:clearAllLogs'),
        log: (level: string, module: string, message: string) => ipcRenderer.invoke('logger:log', level, module, message),
        logBatch: (entries: Array<{ level: string; module: string; message: string }>) => ipcRenderer.invoke('logger:logBatch', entries),
    },

    // RoverService APIs (macOS and Windows)
    roverservice: {
        getInstallationStatus: () => ipcRenderer.invoke('roverservice:getInstallationStatus'),
        install: (helperPath?: string) => ipcRenderer.invoke('roverservice:install', helperPath),
        uninstall: () => ipcRenderer.invoke('roverservice:uninstall'),
    },

    // You can expose other apts you need here.
    // ...
})
