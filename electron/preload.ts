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
        addRuleProvider: (provider: any) => ipcRenderer.invoke('db:addRuleProvider', provider),
        updateRuleProvider: (id: string, updates: any) => ipcRenderer.invoke('db:updateRuleProvider', id, updates),
        deleteRuleProvider: (id: string) => ipcRenderer.invoke('db:deleteRuleProvider', id),
            clearRuleProviders: () => ipcRenderer.invoke('db:clearRuleProviders'),
        updateRuleProviderContent: (id: string, filePath: string, lastUpdate?: string) => ipcRenderer.invoke('db:updateRuleProviderContent', id, filePath, lastUpdate),
        addRuleProvidersBatch: (providers: any[]) => ipcRenderer.invoke('db:addRuleProvidersBatch', providers),
        // Policies
        getPolicies: () => ipcRenderer.invoke('db:getPolicies'),
        getPolicyById: (id: string) => ipcRenderer.invoke('db:getPolicyById', id),
        addPolicy: (policy: any) => ipcRenderer.invoke('db:addPolicy', policy),
        updatePolicy: (id: string, updates: any) => ipcRenderer.invoke('db:updatePolicy', id, updates),
        deletePolicy: (id: string) => ipcRenderer.invoke('db:deletePolicy', id),
        addPoliciesBatch: (policies: any[], clearFirst?: boolean) => ipcRenderer.invoke('db:addPoliciesBatch', policies, clearFirst),
        updatePoliciesOrder: (orders: Array<{ id: string; order: number }>) => ipcRenderer.invoke('db:updatePoliciesOrder', orders),
        clearPolicies: () => ipcRenderer.invoke('db:clearPolicies'),
        // Profile Policies
        getProfilePolicies: () => ipcRenderer.invoke('db:getProfilePolicies'),
        getProfilePolicy: (profileId: string) => ipcRenderer.invoke('db:getProfilePolicy', profileId),
        getProfilePolicyByPolicyId: (profileId: string, policyId: string) => ipcRenderer.invoke('db:getProfilePolicyByPolicyId', profileId, policyId),
        setProfilePolicy: (profileId: string, policyId: string, preferredOutbounds: string[]) => ipcRenderer.invoke('db:setProfilePolicy', profileId, policyId, preferredOutbounds),
        deleteProfilePolicy: (profileId: string) => ipcRenderer.invoke('db:deleteProfilePolicy', profileId),
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
        getActiveConfig: () => ipcRenderer.invoke('core:getActiveConfig'),
        generateConfig: () => ipcRenderer.invoke('core:generateConfig'),
        getSelectedProfile: () => ipcRenderer.invoke('core:getSelectedProfile'),
        updateConfigFile: (updates: { mode?: string; tun?: boolean }) => ipcRenderer.invoke('core:updateConfigFile', updates),
        isAdmin: () => ipcRenderer.invoke('core:isAdmin'),
        restartAsAdmin: () => ipcRenderer.invoke('core:restartAsAdmin'),
        updateTrayMenu: () => ipcRenderer.invoke('core:updateTrayMenu'),
        getCurrentConfigRules: () => ipcRenderer.invoke('core:getCurrentConfigRules'),
        getBuildInfo: () => ipcRenderer.invoke('core:getBuildInfo'),
        downloadRuleProvider: (providerId: string) => ipcRenderer.invoke('core:downloadRuleProvider', providerId),
        addRuleProviderWithDownload: (provider: { name: string; url: string; type?: string; enabled?: boolean }) => ipcRenderer.invoke('core:addRuleProviderWithDownload', provider),
        downloadAllRuleProviders: () => ipcRenderer.invoke('core:downloadAllRuleProviders'),
        getRuleProviderViewContent: (providerId: string) => ipcRenderer.invoke('core:getRuleProviderViewContent', providerId),
        convertClashRuleSetToSingbox: (providerId: string) => ipcRenderer.invoke('core:convertClashRuleSetToSingbox', providerId),
        // Templates & Policies
        getTemplates: () => ipcRenderer.invoke('core:getTemplates'),
        getTemplatePolicies: (templatePath: string) => ipcRenderer.invoke('core:getTemplatePolicies', templatePath),
        importTemplateComplete: (templatePath: string) => ipcRenderer.invoke('core:importTemplateComplete', templatePath),
        getPresetRulesets: () => ipcRenderer.invoke('core:getPresetRulesets'),
        getBuiltinRulesets: () => ipcRenderer.invoke('core:getBuiltinRulesets'),
        addRuleProvidersFromPreset: (aclIds: string[]) => ipcRenderer.invoke('core:addRuleProvidersFromPreset', aclIds),
        importPresetWithOverwrite: (arg: { policies: any[]; presetRulesetIds: string[] }) => ipcRenderer.invoke('core:importPresetWithOverwrite', arg),
        getAvailableOutbounds: () => ipcRenderer.invoke('core:getAvailableOutbounds'),
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

    // Logger APIs
    logger: {
        getLogDir: () => ipcRenderer.invoke('logger:getLogDir'),
        getLogFiles: () => ipcRenderer.invoke('logger:getLogFiles'),
        clearAllLogs: () => ipcRenderer.invoke('logger:clearAllLogs'),
        log: (level: string, module: string, message: string) => ipcRenderer.invoke('logger:log', level, module, message),
        logBatch: (entries: Array<{ level: string; module: string; message: string }>) => ipcRenderer.invoke('logger:logBatch', entries),
    },

    // You can expose other apts you need here.
    // ...
})
