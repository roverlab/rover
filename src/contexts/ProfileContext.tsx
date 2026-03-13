import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

interface ProfileContextType {
  /** 获取当前 seed */
  seed: number;
  /** 更新 seed，触发监听方刷新 */
  refreshSeed: () => void;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [seed, setSeed] = useState(0);

  const refreshSeed = useCallback(() => {
    setSeed(prev => prev + 1);
  }, []);

  // 监听后端发送的订阅更新事件
  useEffect(() => {
    const handleProfileUpdated = (_event: unknown, _profileId: string) => {
      console.log('[ProfileContext] 收到订阅更新通知，刷新 seed');
      refreshSeed();
    };

    window.ipcRenderer.on('profile-updated', handleProfileUpdated);

    return () => {
      window.ipcRenderer.off('profile-updated', handleProfileUpdated);
    };
  }, [refreshSeed]);

  return (
    <ProfileContext.Provider value={{ seed, refreshSeed }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) throw new Error('useProfile must be used within ProfileProvider');
  return context;
}
