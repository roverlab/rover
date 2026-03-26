import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import language resources
import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';
import ru from './locales/ru.json';
import ko from './locales/ko.json';
import fa from './locales/fa.json';
import es from './locales/es.json';

const resources = {
  en: {
    translation: en
  },
  'zh-CN': {
    translation: zhCN
  },
  'zh-TW': {
    translation: zhTW
  },
  ru: {
    translation: ru
  },
  ko: {
    translation: ko
  },
  fa: {
    translation: fa
  },
  es: {
    translation: es
  }
};

// 支持的语言列表
const supportedLanguages = ['en', 'zh-CN', 'zh-TW', 'ru', 'ko', 'fa', 'es'];

// 全局标记是否已初始化
let initialized = false;

/**
 * 获取系统语言，返回支持的语言代码
 * 如果系统语言不在支持列表中，则返回 fallback 语言（英文）
 */
export function getSystemLanguage(): string {
  // 获取浏览器/系统语言，如 'zh-CN', 'zh-TW', 'en-US', 'en-GB', 'ja' 等
  const browserLang = navigator.language || (navigator as any).userLanguage;
  
  if (browserLang && supportedLanguages.includes(browserLang)) {
    return browserLang;
  }
  
  // fallback 为英文
  return 'en';
}

/**
 * 检查数据库中是否有语言设置
 * 用于判断是否需要显示语言选择弹窗
 */
export async function hasLanguageSelected(): Promise<boolean> {
  try {
    const settings = await window.ipcRenderer.db.getAllSettings();
    const savedLanguage = settings['app-language'];
    console.log('[i18n] hasLanguageSelected check, app-language:', savedLanguage);
    // 只检查数据库中的设置，忽略 localStorage
    return !!savedLanguage;
  } catch (e) {
    console.warn('[i18n] Failed to check language setting:', e);
    return false;
  }
}

/**
 * 初始化 i18n，在应用启动时调用一次
 * 从数据库读取语言设置，如果未设置则使用系统语言或默认英文
 */
export async function initI18n(): Promise<typeof i18n> {
  if (initialized) {
    return i18n;
  }

  let savedLang = getSystemLanguage(); // 默认使用系统语言，fallback 为英文
  
  try {
    // 从数据库读取语言设置
    const settings = await window.ipcRenderer.db.getAllSettings();
    if (settings['app-language']) {
      savedLang = settings['app-language'];
    } else {
      // 尝试从 localStorage 读取（兼容旧版本）
      const localStorageLang = localStorage.getItem('i18nextLng');
      if (localStorageLang && supportedLanguages.includes(localStorageLang)) {
        savedLang = localStorageLang;
      }
    }
  } catch (e) {
    console.warn('[i18n] Failed to load language setting from database:', e);
    // 尝试从 localStorage 读取（兼容旧版本）
    const localStorageLang = localStorage.getItem('i18nextLng');
    if (localStorageLang && supportedLanguages.includes(localStorageLang)) {
      savedLang = localStorageLang;
    }
  }

  await i18n.use(initReactI18next).init({
    resources,
    lng: savedLang,
    fallbackLng: 'en',
    debug: false,
    interpolation: {
      escapeValue: false // React already safes from xss
    }
  });

  initialized = true;
  console.log('[i18n] Initialized with language:', savedLang);
  
  return i18n;
}

/**
 * 切换语言并保存到数据库
 * 注意：切换后需要重启应用才能完全生效
 */
export async function changeLanguage(language: string): Promise<void> {
  try {
    // 保存到数据库
    await window.ipcRenderer.db.setSetting('app-language', language);
    // 同时保存到 localStorage（兼容）
    localStorage.setItem('i18nextLng', language);
    
    // 切换 i18n 语言
    await i18n.changeLanguage(language);
    
    console.log('[i18n] Language changed to:', language);
  } catch (error) {
    console.error('[i18n] Failed to change language:', error);
    throw error;
  }
}

/**
 * 获取当前语言
 */
export function getCurrentLanguage(): string {
  return i18n.language || 'zh';
}

/**
 * 获取可用语言列表
 */
export function getAvailableLanguages(): { code: string; nameKey: string }[] {
  return [
    { code: 'en', nameKey: 'settings.langEnglish' },
    { code: 'zh-CN', nameKey: 'settings.langChinese' },
    { code: 'zh-TW', nameKey: 'settings.langChineseTW' },
    { code: 'ru', nameKey: 'settings.langRussian' },
    { code: 'ko', nameKey: 'settings.langKorean' },
    { code: 'fa', nameKey: 'settings.langPersian' },
    { code: 'es', nameKey: 'settings.langSpanish' }
  ];
}

export default i18n;
