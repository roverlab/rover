import i18n from 'i18next';
import en from '../src/i18n/locales/en.json';
import zhCN from '../src/i18n/locales/zh-CN.json';
import zhTW from '../src/i18n/locales/zh-TW.json';
import ru from '../src/i18n/locales/ru.json';
import ko from '../src/i18n/locales/ko.json';
import fa from '../src/i18n/locales/fa.json';
import es from '../src/i18n/locales/es.json';

const resources = {
    en: { translation: en },
    'zh-CN': { translation: zhCN },
    'zh-TW': { translation: zhTW },
    ru: { translation: ru },
    ko: { translation: ko },
    fa: { translation: fa },
    es: { translation: es }
};

// 支持的语言列表
const supportedLanguages = ['en', 'zh-CN', 'zh-TW', 'ru', 'ko', 'fa', 'es'];

let initialized = false;

/**
 * 主进程 i18n（与渲染进程共用 locales JSON，独立 i18next 实例）
 */
export async function initMainI18n(lang: string): Promise<void> {
    const lng = supportedLanguages.includes(lang) ? lang : 'en';
    if (!initialized) {
        await i18n.init({
            resources,
            lng,
            fallbackLng: 'en',
            interpolation: { escapeValue: false }
        });
        initialized = true;
    } else {
        await i18n.changeLanguage(lng);
    }
}

export async function setMainLanguage(language: string): Promise<void> {
    const lng = supportedLanguages.includes(language) ? language : 'en';
    await i18n.changeLanguage(lng);
}

export function t(key: string, options?: Record<string, unknown>): string {
    return i18n.t(key, options);
}
