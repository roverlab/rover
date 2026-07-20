import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Switch } from '../../components/ui/Switch';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { ListRow } from '../../components/ui/Surface';
import {
  CHAIN_PROXY_SETTING_KEY,
  parseChainProxySettings,
  serializeChainProxySettings,
  type ChainProxySettings,
  type ChainSocksHop,
} from '../../types/chain-proxy';

type NicOption = { name: string; address: string; family: 'IPv4' | 'IPv6' };

type Props = {
  /** 初始 settings JSON；父级 loadSettings 后传入 */
  initialRaw?: string;
};

function HopFields({
  hop,
  onChange,
  showBindInterface,
  nicOptions,
  labels,
}: {
  hop: ChainSocksHop;
  onChange: (next: ChainSocksHop) => void;
  showBindInterface?: boolean;
  nicOptions: NicOption[];
  labels: {
    server: string;
    port: string;
    username: string;
    password: string;
    bindInterface: string;
    bindInterfaceNone: string;
    optional: string;
  };
}) {
  if (!hop.enabled) return null;

  return (
    <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
      <div>
        <div className="text-[11px] text-[var(--app-text-quaternary)] mb-1">{labels.server}</div>
        <Input
          type="text"
          value={hop.server}
          placeholder="127.0.0.1"
          onChange={(e) => onChange({ ...hop, server: e.target.value })}
          className="w-full"
        />
      </div>
      <div>
        <div className="text-[11px] text-[var(--app-text-quaternary)] mb-1">{labels.port}</div>
        <Input
          type="number"
          value={hop.server_port}
          min={1}
          max={65535}
          onChange={(e) => onChange({ ...hop, server_port: Number(e.target.value) || 0 })}
          className="w-full"
        />
      </div>
      <div>
        <div className="text-[11px] text-[var(--app-text-quaternary)] mb-1">
          {labels.username}
          <span className="text-[var(--app-text-quaternary)]"> ({labels.optional})</span>
        </div>
        <Input
          type="text"
          value={hop.username || ''}
          onChange={(e) => onChange({ ...hop, username: e.target.value })}
          className="w-full"
          autoComplete="off"
        />
      </div>
      <div>
        <div className="text-[11px] text-[var(--app-text-quaternary)] mb-1">
          {labels.password}
          <span className="text-[var(--app-text-quaternary)]"> ({labels.optional})</span>
        </div>
        <Input
          type="password"
          value={hop.password || ''}
          onChange={(e) => onChange({ ...hop, password: e.target.value })}
          className="w-full"
          autoComplete="new-password"
        />
      </div>
      {showBindInterface && (
        <div className="sm:col-span-2">
          <div className="text-[11px] text-[var(--app-text-quaternary)] mb-1">
            {labels.bindInterface}
            <span className="text-[var(--app-text-quaternary)]"> ({labels.optional})</span>
          </div>
          <Select
            value={hop.bind_interface || ''}
            onChange={(e) => onChange({ ...hop, bind_interface: e.target.value })}
            className="w-full"
          >
            <option value="">{labels.bindInterfaceNone}</option>
            {nicOptions.map((nic) => (
              <option key={nic.name} value={nic.name}>
                {nic.name} ({nic.address})
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}

/**
 * 高级设置：链式代理（SOCKS5 前置 / 后置）
 */
export function ChainProxySection({ initialRaw }: Props) {
  const { t } = useTranslation();
  const [chain, setChain] = useState<ChainProxySettings>(() => parseChainProxySettings(initialRaw));
  const [nicOptions, setNicOptions] = useState<NicOption[]>([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setChain(parseChainProxySettings(initialRaw));
  }, [initialRaw]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await window.ipcRenderer.core.getNetworkInterfaces();
        if (!cancelled) setNicOptions(list || []);
      } catch (e) {
        console.error('Failed to load network interfaces', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hopLabels = {
    server: t('settings.chainProxyServer'),
    port: t('settings.chainProxyPort'),
    username: t('settings.chainProxyUsername'),
    password: t('settings.chainProxyPassword'),
    bindInterface: t('settings.chainProxyBindInterface'),
    bindInterfaceNone: t('settings.chainProxyBindInterfaceNone'),
    optional: t('settings.chainProxyOptional'),
  };

  const validateHop = (hop: ChainSocksHop, label: string): string | null => {
    if (!hop.enabled) return null;
    if (!hop.server?.trim()) return t('settings.chainProxyServerRequired', { hop: label });
    const port = hop.server_port;
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      return t('settings.chainProxyPortInvalid', { hop: label });
    }
    return null;
  };

  const handleSave = async () => {
    if (saving) return;
    setError(null);
    const frontErr = validateHop(chain.front, t('settings.chainProxyFront'));
    if (frontErr) {
      setError(frontErr);
      return;
    }
    const backErr = validateHop(chain.back, t('settings.chainProxyBack'));
    if (backErr) {
      setError(backErr);
      return;
    }

    setSaving(true);
    setSaved(false);
    try {
      await window.ipcRenderer.db.setSetting(CHAIN_PROXY_SETTING_KEY, serializeChainProxySettings(chain));
      await window.ipcRenderer.core.generateConfig();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      console.error('Failed to save chain-proxy', e);
      setError(e?.message || t('settings.chainProxySaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const updateFront = (front: ChainSocksHop) => setChain((c) => ({ ...c, front }));
  const updateBack = (back: ChainSocksHop) => setChain((c) => ({ ...c, back }));

  return (
    <>
      <ListRow className="flex-col items-stretch gap-2 py-3">
        <div className="flex items-start justify-between gap-3 w-full">
          <div>
            <div className="list-row-title">{t('settings.chainProxy')}</div>
            <div className="list-row-description">{t('settings.chainProxyDesc')}</div>
          </div>
        </div>

        {/* 前置 */}
        <div className="w-full rounded-[10px] border border-[var(--app-stroke)] bg-[var(--app-panel)]/40 p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-medium text-[var(--app-text)]">{t('settings.chainProxyFront')}</div>
              <div className="text-[11px] text-[var(--app-text-quaternary)] mt-0.5">
                {t('settings.chainProxyFrontDesc')}
              </div>
            </div>
            <Switch
              checked={chain.front.enabled}
              onCheckedChange={(v) => updateFront({ ...chain.front, enabled: v })}
            />
          </div>
          <HopFields
            hop={chain.front}
            onChange={updateFront}
            showBindInterface
            nicOptions={nicOptions}
            labels={hopLabels}
          />
        </div>

        {/* 后置 */}
        <div className="w-full rounded-[10px] border border-[var(--app-stroke)] bg-[var(--app-panel)]/40 p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-medium text-[var(--app-text)]">{t('settings.chainProxyBack')}</div>
              <div className="text-[11px] text-[var(--app-text-quaternary)] mt-0.5">
                {t('settings.chainProxyBackDesc')}
              </div>
            </div>
            <Switch
              checked={chain.back.enabled}
              onCheckedChange={(v) => updateBack({ ...chain.back, enabled: v })}
            />
          </div>
          <HopFields hop={chain.back} onChange={updateBack} nicOptions={nicOptions} labels={hopLabels} />
        </div>

        {error && <div className="text-[12px] text-[var(--app-danger)]">{error}</div>}

        <div className="flex items-center gap-2 justify-end">
          {saved && !saving && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--app-success)]">
              <Check className="w-3 h-3" />
              {t('settings.saved')}
            </span>
          )}
          <Button variant="secondary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? t('settings.chainProxySaving') : t('actions.save')}
          </Button>
        </div>
      </ListRow>
    </>
  );
}
