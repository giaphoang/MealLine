// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import * as React from 'react';
import config from '@/config/config';
import { setCarbonCategoricalOrder } from '@/lib/colors';
import type { BrandPreview } from '@/services/brand';
import { TerminologyProvider } from './TerminologyContext';

export type Oklch = { l: number; c: number; h: number };
export type BrandAssetReference =
  | { kind: 'builtin'; src: string; width: number; height: number }
  | {
      kind: 'database';
      id: string;
      width: number;
      height: number;
      mimeType?: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml';
      /** The saved file's name, shown in the wizard's upload slots. */
      filename?: string;
    };

export type BrandConfigurationPayload = {
  schemaVersion: 1;
  identity: {
    organizationName: string;
    appName: string;
    tagline: string;
    description: string;
    organizationWebsite: string;
  };
  logo: {
    light: BrandAssetReference;
    dark: BrandAssetReference;
    square?: BrandAssetReference;
    squareDerivatives?: {
      size64: BrandAssetReference;
      size192: BrandAssetReference;
      size512: BrandAssetReference;
    };
    /** How the light-mode mark sits on the page; see BrandLogo. */
    presentation?: 'transparent' | 'dark-surface';
  };
  colors: {
    accent: Oklch;
    accentDark?: Oklch;
    neutral?: Oklch;
    hierarchy: Oklch[];
    accentFamily?: string;
    accentDarkFamily?: string;
    neutralFamily?: string;
  };
  staff: { signInTitle: string; emailGuidance: string; emailPlaceholder: string };
  capabilities: { publicInventory: boolean };
  terminology?: {
    pantrySingular: string;
    pantryPlural: string;
    clientSingular: string;
    clientPlural: string;
    departmentName: string;
    active: boolean;
  };
};

export type PublicBrand = {
  source: 'configured' | 'compiled-default';
  configId: string | null;
  warning: string | null;
  identity: BrandConfigurationPayload['identity'];
  logo: {
    lightSrc: string; darkSrc: string; squareSrc: string | null;
    lightWidth: number; lightHeight: number; darkWidth: number; darkHeight: number;
    presentation: 'transparent' | 'dark-surface';
  };
  staff: BrandConfigurationPayload['staff'];
  capabilities: BrandConfigurationPayload['capabilities'];
  terminology: NonNullable<BrandConfigurationPayload['terminology']>;
  chartOrder: string[];
};

const DEFAULT_BRAND: PublicBrand = {
  source: 'compiled-default', configId: null, warning: null,
  identity: {
    organizationName: 'MealLine', appName: 'MealLine',
    tagline: 'Food access infrastructure',
    description: 'Food pantry management software for non-profits.',
    organizationWebsite: 'http://localhost:3003',
  },
  logo: {
    lightSrc: '/feed/brand/mealline-mark.svg', darkSrc: '/feed/brand/mealline-mark.svg', squareSrc: '/feed/brand/mealline-mark.svg',
    lightWidth: 64, lightHeight: 64, darkWidth: 64, darkHeight: 64,
    presentation: 'transparent',
  },
  staff: {
    signInTitle: 'Sign in to MealLine',
    emailGuidance: 'Staff access — use your authorized work email',
    emailPlaceholder: 'you@example.org',
  },
  capabilities: { publicInventory: true },
  terminology: {
    pantrySingular: 'food pantry', pantryPlural: 'food pantries',
    clientSingular: 'client', clientPlural: 'clients',
    departmentName: 'Social Services', active: true,
  },
  chartOrder: ['blue', 'magenta', 'teal', 'orange', 'purple', 'green', 'yellow', 'cyan', 'red', 'warmGray'],
};

const BrandContext = React.createContext<PublicBrand>(DEFAULT_BRAND);
export const useBrand = () => React.useContext(BrandContext);

type BrandPreviewControls = {
  isPreviewing: boolean;
  preview: (config: BrandConfigurationPayload, derived: BrandPreview) => void;
  clear: () => void;
};
const BrandPreviewContext = React.createContext<BrandPreviewControls>({
  isPreviewing: false, preview: () => undefined, clear: () => undefined,
});
export const useBrandPreview = () => React.useContext(BrandPreviewContext);

const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) || config.api.baseUrl).replace(/\/$/, '');
export const resolveBrandAssetSrc = (src: string) => {
  // Built-in and uploaded assets share the mounted workspace's URL prefix.
  return src.startsWith('/') && !src.startsWith('/feed/') && API_BASE ? `${API_BASE}${src}` : src;
};

export const resolveBrandAssetReference = (reference: BrandAssetReference) =>
  resolveBrandAssetSrc(
    reference.kind === 'database'
      ? `/api/brand/assets/${encodeURIComponent(reference.id)}`
      : reference.src
  );

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [brand, setBrand] = React.useState(DEFAULT_BRAND);
  const [candidate, setCandidate] = React.useState<{
    config: BrandConfigurationPayload; derived: BrandPreview;
  } | null>(null);
  const [ready, setReady] = React.useState(import.meta.env.MODE === 'test');

  const applyCandidateStyle = React.useCallback((derived: BrandPreview | null) => {
    document.getElementById('feed-brand-session-preview')?.remove();
    if (!derived) return;
    const declarations = (scope: 'light' | 'dark', indent: string) =>
      Object.entries(derived.tokens[scope]).map(([token, value]) => `${indent}--${token}: ${value};`).join('\n');
    const style = document.createElement('style');
    style.id = 'feed-brand-session-preview';
    style.textContent = `:root, .light {\n${declarations('light', '  ')}\n}\n.dark {\n${declarations('dark', '  ')}\n}\n@media (prefers-color-scheme: dark) {\n  :root:not(.light) {\n${declarations('dark', '    ')}\n  }\n}`;
    document.head.appendChild(style);
  }, []);

  React.useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/api/brand/current`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Brand request failed');
        return response.json();
      })
      .then(({ brand: loaded }: { brand: PublicBrand }) => {
        if (!active) return;
        const next = {
          ...loaded,
          logo: {
            ...loaded.logo,
            lightSrc: resolveBrandAssetSrc(loaded.logo.lightSrc),
            darkSrc: resolveBrandAssetSrc(loaded.logo.darkSrc),
            squareSrc: loaded.logo.squareSrc ? resolveBrandAssetSrc(loaded.logo.squareSrc) : null,
          },
        };
        setCarbonCategoricalOrder(next.chartOrder);
        setBrand(next);
        document.title = `${next.identity.appName} System`;
        // Only a genuinely square mark may become the tab icon. Falling back to
        // the main logo squashed a wide lockup into the favicon — the compiled
        // default's was 3.8:1, and both bundled templates are ~3:1. A brand with
        // no square mark keeps the icon already in the document instead.
        const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
        if (icon && next.logo.squareSrc) icon.href = next.logo.squareSrc;
        try {
          const saved = sessionStorage.getItem('feed.brandPreview');
          if (saved) {
            const parsed = JSON.parse(saved) as { config: BrandConfigurationPayload; derived: BrandPreview };
            setCandidate(parsed);
            applyCandidateStyle(parsed.derived);
            setCarbonCategoricalOrder(parsed.derived.chartOrder);
          }
        } catch {
          sessionStorage.removeItem('feed.brandPreview');
        }
        setReady(true);
      })
      .catch(() => {
        // Fail closed to the compiled default. Settings surfaces the server's
        // resolver warning when it is reachable; login must remain usable.
        if (active) setReady(true);
      });
    return () => { active = false; };
  }, [applyCandidateStyle]);

  const preview = React.useCallback((config: BrandConfigurationPayload, derived: BrandPreview) => {
    const next = { config: structuredClone(config), derived };
    sessionStorage.setItem('feed.brandPreview', JSON.stringify(next));
    setCandidate(next);
    applyCandidateStyle(derived);
    setCarbonCategoricalOrder(derived.chartOrder);
  }, [applyCandidateStyle]);

  const clear = React.useCallback(() => {
    sessionStorage.removeItem('feed.brandPreview');
    setCandidate(null);
    applyCandidateStyle(null);
    setCarbonCategoricalOrder(brand.chartOrder);
  }, [applyCandidateStyle, brand.chartOrder]);

  const displayed = React.useMemo<PublicBrand>(() => {
    if (!candidate) return brand;
    const square = candidate.config.logo.squareDerivatives?.size192 ?? candidate.config.logo.square;
    return {
      source: brand.source,
      configId: brand.configId,
      warning: brand.warning,
      identity: candidate.config.identity,
      logo: {
        lightSrc: resolveBrandAssetReference(candidate.config.logo.light),
        darkSrc: resolveBrandAssetReference(candidate.config.logo.dark),
        squareSrc: square ? resolveBrandAssetReference(square) : null,
        lightWidth: candidate.config.logo.light.width,
        lightHeight: candidate.config.logo.light.height,
        darkWidth: candidate.config.logo.dark.width,
        darkHeight: candidate.config.logo.dark.height,
        presentation: candidate.config.logo.presentation ?? 'transparent',
      },
      staff: candidate.config.staff,
      capabilities: candidate.config.capabilities,
      terminology: candidate.config.terminology ?? brand.terminology,
      chartOrder: candidate.derived.chartOrder,
    };
  }, [brand, candidate]);

  // Mount chart surfaces only after the public brand payload has rotated the
  // Carbon order. Many chart configs are created during their first render;
  // mounting them earlier would preserve the compiled order until navigation.
  if (!ready) return null;
  return (
    <BrandContext.Provider value={displayed}>
      <TerminologyProvider settings={displayed.terminology}>
        <BrandPreviewContext.Provider value={{ isPreviewing: candidate !== null, preview, clear }}>
          {children}
        </BrandPreviewContext.Provider>
      </TerminologyProvider>
    </BrandContext.Provider>
  );
}
