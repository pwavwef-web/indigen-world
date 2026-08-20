import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PlatformConfiguration } from '@indigen-world/contracts/creator-models';
import { fetchConfig, WHATSAPP_CHANNEL_URL } from './data';

interface CreatorConfigValue {
  config: PlatformConfiguration | null;
  loading: boolean;
  whatsappUrl: string;
}

const Ctx = createContext<CreatorConfigValue>({ config: null, loading: true, whatsappUrl: WHATSAPP_CHANNEL_URL });

/** Loads the public platform configuration once and shares it across creator surfaces. */
export function CreatorProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PlatformConfiguration | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void fetchConfig().then((c) => {
      if (active) {
        setConfig(c);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Ctx.Provider value={{ config, loading, whatsappUrl: config?.whatsappChannelUrl || WHATSAPP_CHANNEL_URL }}>
      {children}
    </Ctx.Provider>
  );
}

export function useConfig(): CreatorConfigValue {
  return useContext(Ctx);
}
