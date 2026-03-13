import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface OverrideRulesContextType {
  overrideRules: boolean;
  refreshOverrideRules: () => Promise<void>;
}

const OverrideRulesContext = createContext<OverrideRulesContextType | undefined>(undefined);

export function OverrideRulesProvider({ children }: { children: ReactNode }) {
  const [overrideRules, setOverrideRules] = useState(false);

  const refreshOverrideRules = async () => {
    try {
      const val = await window.ipcRenderer.db.getSetting('override-rules', 'false');
      setOverrideRules(val === 'true');
    } catch {
      setOverrideRules(false);
    }
  };

  useEffect(() => {
    refreshOverrideRules();
  }, []);

  return (
    <OverrideRulesContext.Provider value={{ overrideRules, refreshOverrideRules }}>
      {children}
    </OverrideRulesContext.Provider>
  );
}

export function useOverrideRules() {
  const context = useContext(OverrideRulesContext);
  if (!context) throw new Error('useOverrideRules must be used within OverrideRulesProvider');
  return context;
}
