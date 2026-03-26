import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { changeLanguage, getSystemLanguage, getAvailableLanguages } from '../i18n';

interface LanguageSelectModalProps {
  open: boolean;
  onClose: () => void;
}

export const LanguageSelectModal: React.FC<LanguageSelectModalProps> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const [currentLanguage, setCurrentLanguage] = useState(getSystemLanguage());
  const availableLanguages = getAvailableLanguages();

  // 每次打开时更新当前语言为系统语言
  useEffect(() => {
    if (open) {
      setCurrentLanguage(getSystemLanguage());
    }
  }, [open]);

  const handleLanguageSelect = async (languageCode: string) => {
    await changeLanguage(languageCode);
    setCurrentLanguage(languageCode);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative z-10 w-full max-w-md bg-white border border-[rgba(39,44,54,0.08)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between px-6 py-5 border-b border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--app-accent-soft)] flex items-center justify-center">
                  <Globe className="w-5 h-5 text-[var(--app-accent)]" />
                </div>
                <div>
                  <h2 className="text-[16px] font-semibold text-[var(--app-text)]">{t('languageModal.title')}</h2>
                  <p className="text-[12px] text-[var(--app-text-quaternary)] mt-0.5">{t('languageModal.subtitle')}</p>
                </div>
              </div>
            </div>

            <div className="p-4">
              <div className="space-y-2">
                {availableLanguages.map((language) => (
                  <button
                    key={language.code}
                    onClick={() => handleLanguageSelect(language.code)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-[12px] transition-all border ${
                      currentLanguage === language.code
                        ? 'border-[var(--app-accent-border)] bg-[var(--app-accent-soft-card)] text-[var(--app-text)]'
                        : 'border-[var(--app-stroke)] bg-white/40 text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-left">
                        <div className="text-[14px] font-medium">{t(language.nameKey)}</div>
                        <div className="text-[11px] text-[var(--app-text-quaternary)]">{language.code}</div>
                      </div>
                    </div>
                    {currentLanguage === language.code && (
                      <Check className="w-5 h-5 text-[var(--app-accent)]" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 px-6 py-4 border-t border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/30">
              <p className="text-[11px] text-[var(--app-text-quaternary)]">
                {t('languageModal.changeLater')}
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
