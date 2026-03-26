import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { changeLanguage, getCurrentLanguage, getAvailableLanguages } from '../i18n';
import { Globe } from 'lucide-react';

export const LanguageSwitcher: React.FC = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState(getCurrentLanguage());
  const availableLanguages = getAvailableLanguages();

  const handleLanguageChange = async (languageCode: string) => {
    await changeLanguage(languageCode);
    setCurrentLanguage(languageCode);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)] transition-colors"
        title={t('settings.language')}
      >
        <Globe className="w-4 h-4" />
        <span className="font-medium">
          {(() => {
            const lang = availableLanguages.find((l) => l.code === currentLanguage);
            return lang ? t(lang.nameKey) : t('settings.languageLabel');
          })()}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-32 bg-white border border-[var(--app-divider)] rounded-lg shadow-lg z-50">
          {availableLanguages.map((language) => (
            <button
              key={language.code}
              onClick={() => handleLanguageChange(language.code)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--app-hover)] transition-colors ${
                currentLanguage === language.code
                  ? 'text-[var(--app-accent)] bg-[var(--app-accent-soft)]'
                  : 'text-[var(--app-text-secondary)]'
              }`}
            >
              {t(language.nameKey)}
            </button>
          ))}
        </div>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};
