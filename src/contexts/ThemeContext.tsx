import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'theme';
const LOCAL_STORAGE_KEY = 'rover-theme';

/**
 * 从 DOM 上已有的 .dark class 推断当前主题。
 * index.html 内联脚本已经同步设置好了 .dark class，无需再读 localStorage。
 */
function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  // 同步 DOM：theme 变化时更新 .dark class 和 localStorage
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try { localStorage.setItem(LOCAL_STORAGE_KEY, theme); } catch {}
  }, [theme]);

  // 异步从数据库同步持久化的主题设置（可能覆盖初始值）
  useEffect(() => {
    let mounted = true;
    const syncFromDb = async () => {
      try {
        const saved = await window.ipcRenderer.db.getSetting(STORAGE_KEY, '');
        if (!mounted) return;
        if (saved === 'dark' || saved === 'light') {
          setThemeState(saved);
        }
      } catch {
        // 数据库读取失败，保持当前主题即可
      }
    };
    syncFromDb();
    return () => { mounted = false; };
  }, []);

  const setTheme = useCallback(async (newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      await window.ipcRenderer.db.setSetting(STORAGE_KEY, newTheme);
    } catch {
      // ignore persistence errors
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
