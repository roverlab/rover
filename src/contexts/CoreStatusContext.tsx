import React, { createContext, useContext, useState, useCallback } from 'react';

interface CoreStatus {
    isRunning: boolean;
    isLoading: boolean;
}

interface CoreStatusContextType extends CoreStatus {
    setStatus: (status: Partial<CoreStatus>) => void;
}

const CoreStatusContext = createContext<CoreStatusContextType>({
    isRunning: false,
    isLoading: false,
    setStatus: () => {},
});

export function useCoreStatus() {
    return useContext(CoreStatusContext);
}

export function CoreStatusProvider({ children }: { children: React.ReactNode }) {
    const [status, setStatusInternal] = useState<CoreStatus>({
        isRunning: false,
        isLoading: false,
    });

    const setStatus = useCallback((update: Partial<CoreStatus>) => {
        setStatusInternal(prev => ({ ...prev, ...update }));
    }, []);

    return (
        <CoreStatusContext.Provider value={{ ...status, setStatus }}>
            {children}
        </CoreStatusContext.Provider>
    );
}
