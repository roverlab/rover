import { useState, useEffect, useCallback } from 'react';

export type PolicyFinalOutboundValue = 'direct_out' | 'block_out' | 'selector_out';

export function usePolicyFinalOutbound() {
    const [value, setValue] = useState<PolicyFinalOutboundValue>('selector_out');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const saved = await window.ipcRenderer.db.getSetting('policy-final-outbound', 'selector_out');
                if (saved === 'direct_out' || saved === 'block_out' || saved === 'selector_out') {
                    setValue(saved);
                }
            } catch (err) {
                console.error('Failed to load policy final outbound:', err);
            }
        };
        load();
    }, []);

    const refresh = useCallback(async () => {
        try {
            const saved = await window.ipcRenderer.db.getSetting('policy-final-outbound', 'selector_out');
            if (saved === 'direct_out' || saved === 'block_out' || saved === 'selector_out') {
                setValue(saved);
            }
        } catch (err) {
            console.error('Failed to refresh policy final outbound:', err);
        }
    }, []);

    const onChange = useCallback(async (newValue: PolicyFinalOutboundValue): Promise<void> => {
        if (newValue === value || saving) return;
        const previous = value;
        setValue(newValue);
        setSaving(true);
        try {
            await window.ipcRenderer.db.setPolicyFinalOutbound(newValue);
        } catch (err) {
            setValue(previous);
            throw err;
        } finally {
            setSaving(false);
        }
    }, [value, saving]);

    return { value, saving, onChange, refresh };
}
