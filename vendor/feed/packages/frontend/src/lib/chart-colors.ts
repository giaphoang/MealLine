// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { type ChartConfig } from "@/components/ui/chart"

export const chartPresets = {
  primary: {
    theme: {
      light: 'var(--chart-primary)',
      dark: 'var(--chart-primary)'
    }
  },
  success: {
    theme: {
      light: 'var(--chart-success)',
      dark: 'var(--chart-success)'
    }
  },
  warning: {
    theme: {
      light: 'var(--chart-warning)',
      dark: 'var(--chart-warning)'
    }
  },
  danger: {
    theme: {
      light: 'var(--chart-danger)',
      dark: 'var(--chart-danger)'
    }
  },
  info: {
    theme: {
      light: 'var(--chart-info)',
      dark: 'var(--chart-info)'
    }
  },
  muted: {
    theme: {
      light: 'var(--chart-muted)',
      dark: 'var(--chart-muted)'
    }
  }
} as const;

export const chartConfigs = {
  base: {
    label: {
      theme: {
        light: 'var(--foreground)',
        dark: 'var(--foreground)'
      }
    }
  },
  success: {
    ...chartPresets.success,
    label: "Success"
  },
  warning: {
    ...chartPresets.warning,
    label: "Warning"
  },
  danger: {
    ...chartPresets.danger,
    label: "Danger"
  },
  info: {
    ...chartPresets.info,
    label: "Info"
  }
} satisfies Record<string, ChartConfig>;

export type ChartColorPreset = keyof typeof chartPresets;
export type ChartConfigPreset = keyof typeof chartConfigs;