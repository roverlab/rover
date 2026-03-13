import { createContext, useContext, useState, ReactNode } from 'react';

interface ApiContextType {
  apiUrl: string;
  apiSecret: string;
  setApiUrl: (url: string) => void;
  setApiSecret: (secret: string) => void;
}

const ApiContext = createContext<ApiContextType | undefined>(undefined);

export function ApiProvider({ children }: { children: ReactNode }) {
  const [apiUrl, setApiUrl] = useState(localStorage.getItem('apiUrl') || 'http://127.0.0.1:9090');
  const [apiSecret, setApiSecret] = useState(localStorage.getItem('apiSecret') || '');

  const handleSetApiUrl = (url: string) => {
    localStorage.setItem('apiUrl', url);
    setApiUrl(url);
  };

  const handleSetApiSecret = (secret: string) => {
    localStorage.setItem('apiSecret', secret);
    setApiSecret(secret);
  };

  return (
    <ApiContext.Provider value={{ apiUrl, apiSecret, setApiUrl: handleSetApiUrl, setApiSecret: handleSetApiSecret }}>
      {children}
    </ApiContext.Provider>
  );
}

export function useApi() {
  const context = useContext(ApiContext);
  if (!context) throw new Error('useApi must be used within ApiProvider');
  return context;
}
