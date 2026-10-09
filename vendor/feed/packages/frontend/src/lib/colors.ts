// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { type ChartConfig } from "@/components/ui/chart"

export type ColorScheme = 'light' | 'dark';
export type StatusColor = 'success' | 'warning' | 'error' | 'info';

const baseColors = {
  blue: {
    light: 'hsl(217, 91%, 60%)',
    dark: 'hsl(217, 91%, 65%)'
  },
  green: {
    light: 'hsl(142, 71%, 45%)',
    dark: 'hsl(142, 71%, 50%)'
  },
  pink: {
    light: 'hsl(335, 78%, 42%)',
    dark: 'hsl(335, 78%, 47%)'
  },
  orange: {
    light: 'hsl(29, 84%, 52%)',
    dark: 'hsl(29, 84%, 57%)'
  },
  purple: {
    light: 'hsl(262, 83%, 58%)',
    dark: 'hsl(262, 83%, 63%)'
  },
  cyan: {
    light: 'hsl(186, 94%, 41%)',
    dark: 'hsl(186, 94%, 46%)'
  }
} as const;

export const chartColors = {
  category: {
    light: [
      baseColors.blue.light,
      baseColors.green.light,
      baseColors.pink.light,
      baseColors.orange.light,
      baseColors.purple.light,
      baseColors.cyan.light,
    ],
    dark: [
      baseColors.blue.dark,
      baseColors.green.dark,
      baseColors.pink.dark,
      baseColors.orange.dark,
      baseColors.purple.dark,
      baseColors.cyan.dark,
    ]
  },
  status: {
    light: {
      success: baseColors.green.light,
      warning: 'hsl(38, 92%, 50%)',
      error: 'hsl(346, 87%, 47%)',
      info: baseColors.blue.light,
    },
    dark: {
      success: baseColors.green.dark,
      warning: 'hsl(38, 92%, 55%)',
      error: 'hsl(346, 87%, 52%)',
      info: baseColors.blue.dark,
    }
  }
} as const;

export function getChartColor(index: number, scheme: ColorScheme = 'light'): string {
  return chartColors.category[scheme][index % chartColors.category[scheme].length];
}

export function getChartStatusColor(status: StatusColor, scheme: ColorScheme = 'light'): string {
  return chartColors.status[scheme][status];
}

/**
 * IBM Carbon Design System data-visualization palette.
 *
 * FEED uses contrast-tested Carbon grades rather than assuming every Carbon
 * token is suitable on every background. The chart-color regression suite
 * enforces at least 4.5:1 against FEED's light and dark card surfaces. Carbon
 * hue families are designed for color-vision accessibility, but charts still
 * retain direct legend and tooltip labels rather than relying on color alone:
 * - https://medium.com/carbondesign/color-palettes-and-accessibility-features-for-data-visualization-7869f4874fca
 * - https://v10.carbondesignsystem.com/guidelines/accessibility/color/
 *
 * Ten hue families, two grades each. Light mode uses darker 60/70-range
 * tokens; dark mode uses lighter 40/30-range tokens. For multi-series charts, pick
 * non-adjacent hue families rather than walking one family's grades —
 * {@link CARBON_CATEGORICAL_ORDER} encodes that ordering.
 */
export type CarbonFamily =
  | 'blue' | 'cyan' | 'teal' | 'green' | 'magenta'
  | 'purple' | 'red' | 'orange' | 'yellow' | 'warmGray';
export type CarbonGrade = 'primary' | 'secondary';

export const carbonChartColors: Record<
  CarbonFamily,
  Record<CarbonGrade, Record<ColorScheme, string>>
> = {
  blue: {
    primary: { light: '#0f62fe', dark: '#78a9ff' },
    secondary: { light: '#0043ce', dark: '#a6c8ff' },
  },
  cyan: {
    primary: { light: '#0072c3', dark: '#33b1ff' },
    secondary: { light: '#00539a', dark: '#82cfff' },
  },
  teal: {
    primary: { light: '#007d79', dark: '#3ddbd9' },
    secondary: { light: '#005d5d', dark: '#9ef0f0' },
  },
  green: {
    primary: { light: '#198038', dark: '#42be65' },
    secondary: { light: '#0e6027', dark: '#6fdc8c' },
  },
  magenta: {
    primary: { light: '#d02670', dark: '#ff7eb6' },
    secondary: { light: '#9f1853', dark: '#ffafd2' },
  },
  purple: {
    primary: { light: '#8a3ffc', dark: '#be95ff' },
    secondary: { light: '#6929c4', dark: '#d4bbff' },
  },
  red: {
    primary: { light: '#da1e28', dark: '#ff8389' },
    secondary: { light: '#a2191f', dark: '#ffb3b8' },
  },
  orange: {
    primary: { light: '#ba4e00', dark: '#ff832b' },
    secondary: { light: '#8a3800', dark: '#ffb784' },
  },
  yellow: {
    primary: { light: '#8e6a00', dark: '#d2a106' },
    secondary: { light: '#684e00', dark: '#f1c21b' },
  },
  warmGray: {
    primary: { light: '#726e6e', dark: '#ada8a8' },
    secondary: { light: '#565151', dark: '#cac5c4' },
  },
} as const;

/**
 * Hue-hopping order for categorical series: each family sits far from its
 * neighbors on the color wheel, so adjacent chart series stay
 * distinguishable (including under color-vision deficiency).
 */
export const CARBON_CATEGORICAL_ORDER: readonly CarbonFamily[] = [
  'blue', 'magenta', 'teal', 'orange', 'purple',
  'green', 'yellow', 'cyan', 'red', 'warmGray',
];

let runtimeCategoricalOrder: readonly CarbonFamily[] = CARBON_CATEGORICAL_ORDER;

/** Apply the server-proven brand rotation without changing Carbon's hue-hopping order. */
export function setCarbonCategoricalOrder(order: readonly string[]): void {
  const known = new Set(CARBON_CATEGORICAL_ORDER);
  if (order.length !== CARBON_CATEGORICAL_ORDER.length || order.some((family) => !known.has(family as CarbonFamily))) {
    runtimeCategoricalOrder = CARBON_CATEGORICAL_ORDER;
    return;
  }
  runtimeCategoricalOrder = order as readonly CarbonFamily[];
}

/** Current server-proven order for charts that need to filter family roles. */
export function carbonCategoricalFamilies(): readonly CarbonFamily[] {
  return runtimeCategoricalOrder;
}

export function getCarbonChartColor(
  family: CarbonFamily,
  grade: CarbonGrade = 'primary',
  scheme: ColorScheme = 'light'
): string {
  return carbonChartColors[family][grade][scheme];
}

/** ChartConfig-ready light/dark theme for a Carbon family. */
export function carbonTheme(
  family: CarbonFamily,
  grade: CarbonGrade = 'primary'
): Record<ColorScheme, string> {
  return {
    light: carbonChartColors[family][grade].light,
    dark: carbonChartColors[family][grade].dark,
  };
}

/**
 * Nth categorical series color: first cycle uses each family's primary
 * grade, second cycle the secondary grade (20 distinct colors total).
 */
export function carbonCategoricalTheme(index: number): Record<ColorScheme, string> {
  const families = runtimeCategoricalOrder;
  const family = families[index % families.length];
  const grade: CarbonGrade =
    Math.floor(index / families.length) % 2 === 0 ? 'primary' : 'secondary';
  return carbonTheme(family, grade);
}

export const chartConfigPresets = {
  categoryChart: {
    items: {
      label: "Items",
      theme: {
        light: baseColors.blue.light,
        dark: baseColors.blue.dark
      }
    },
    label: {
      theme: {
        light: 'var(--background)',
        dark: 'var(--background)'
      }
    },
    categoryLabel: {
      theme: {
        light: 'var(--background)',
        dark: 'var(--background)'
      }
    }
  } satisfies ChartConfig,
  
  inventoryChart: {
    items: {
      label: "Items",
    },
    inStock: {
      label: "In Stock",
      theme: {
        light: baseColors.green.light,
        dark: baseColors.green.dark
      }
    },
    limited: {
      label: "Limited",
      theme: {
        light: baseColors.orange.light,
        dark: baseColors.orange.dark
      }
    },
    clearance: {
      label: "Clearance",
      theme: {
        light: baseColors.pink.light,
        dark: baseColors.pink.dark
      }
    },
  } satisfies ChartConfig
} as const;
