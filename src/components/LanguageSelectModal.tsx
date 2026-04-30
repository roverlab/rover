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
  const [selectedLanguage, setSelectedLanguage] = useState(getSystemLanguage());
  const availableLanguages = getAvailableLanguages();

  // 每次打开时更新当前选中语言为系统语言
  useEffect(() => {
    if (open) {
      setSelectedLanguage(getSystemLanguage());
    }
  }, [open]);

  const handleLanguageSelect = (languageCode: string) => {
    setSelectedLanguage(languageCode);
  };

  const handleConfirm = async () => {
    await changeLanguage(selectedLanguage);
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
            className="absolute inset-0 z-0 bg-black/50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative z-10 w-full max-w-md bg-background border border-border rounded-lg shadow-lg overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between px-6 py-5 border-b border-border bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                  <Globe className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-[16px] font-semibold text-foreground">{t('languageModal.title')}</h2>
                  <p className="text-[12px] text-muted-foreground mt-0.5">{t('languageModal.subtitle')}</p>
                </div>
              </div>
            </div>

            <div className="p-4">
              <div className="space-y-2">
                {availableLanguages.map((language) => (
                  <button
                    key={language.code}
                    onClick={() => handleLanguageSelect(language.code)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-md transition-all border ${
                      selectedLanguage === language.code
                        ? 'border-primary/30 bg-accent text-foreground'
                        : 'border-border bg-background/40 text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-left">
                        <div className="text-[14px] font-medium">{language.name}</div>
                      </div>
                    </div>
                    {selectedLanguage === language.code && (
                      <Check className="w-5 h-5 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/30">
              <p className="text-[11px] text-muted-foreground flex-1">
                {t('languageModal.changeLater')}
              </p>
              <button
                onClick={handleConfirm}
                className="px-5 py-2 text-[13px] font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-md transition-colors"
              >
                {t('common.confirm')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
