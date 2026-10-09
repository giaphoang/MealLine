// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

interface ApiConfig {
  baseUrl: string;
  endpoints: {
    globalLimit: string;
    categories: {
      base: string;
      byId: (id: number) => string;
      bulk: string;
    };
    foodItems: {
      base: string;
      byId: (id: number) => string;
      bulk: string;
    };
    languages: {
      base: string;
      enabled: string;
      bulk: string;
    };
    translations: {
      base: string;
      byId: (id: number) => string;
      bulk: string;
    };
    alerts: {
      base: string;
      byId: (id: number) => string;
    };
    projections: {
      base: string;
      costs: string;
      stats: string;
      optimizations: string;
      tokenMetrics: string;
    };
    customTexts: {
      base: string;
      byId: (id: number) => string;
    };
    shoppingLists: {
      base: string;
      byId: (id: number) => string;
      bulk: string;
      instances: string;
      generate: string;
      instanceById: (id: number) => string;
    };
    aiConfig: {
      base: string;
      byId: (id: number) => string;
      bulk: string;
    };
    systemPrompts: {
      base: string;
      byId: (id: number) => string;
      bulk: string;
    };
    settings: {
      base: string;
      operatingHours: string;
    };
    service: {
      base: string;
    };
    admin: {
      base: string;
      users: string;
      invite: string;
      userRole: (id: string) => string;
      userAccess: (id: string) => string;
      userById: (id: string) => string;
      accessPolicy: string;
      audit: string;
      backup: string;
      databaseSummary: string;
      restore: string;
      restoreUnits: string;
      restoreValidate: string;
      restoreReset: string;
    };
  };
}

interface AppConfig {
  api: ApiConfig;
}

const config: AppConfig = {
  api: {
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '/feed',
    endpoints: {
      globalLimit: '/api/global-limit',
      categories: {
        base: '/api/categories',
        byId: (id: number) => `/api/categories/${id}`,
        bulk: '/api/categories/bulk'
      },
      foodItems: {
        base: '/api/food-items',
        byId: (id: number) => `/api/food-items/${id}`,
        bulk: '/api/food-items/bulk'
      },
      languages: {
        base: '/api/languages',
        enabled: '/api/languages/enabled',
        bulk: '/api/languages/bulk'
      },
      translations: {
        base: '/api/translations',
        byId: (id: number) => `/api/translations/${id}`,
        bulk: '/api/translations/bulk'
      },
      alerts: {
        base: '/api/alerts',
        byId: (id: number) => `/api/alerts/${id}`
      },
      projections: {
        base: '/api/projections',
        costs: '/api/projections/costs',
        stats: '/api/projections/stats',
        optimizations: '/api/projections/optimizations',
        tokenMetrics: '/api/projections/token-metrics'
      },
      customTexts: {
        base: '/api/custom-texts',
        byId: (id: number) => `/api/custom-texts/${id}`
      },
      shoppingLists: {
        base: '/api/shopping-lists',
        byId: (id: number) => `/api/shopping-lists/${id}`,
        bulk: '/api/shopping-lists/bulk',
        instances: '/api/shopping-lists/instances',
        generate: '/api/shopping-lists/generate',
        instanceById: (id: number) => `/api/shopping-lists/instances/${id}`
      },
      aiConfig: {
        base: '/api/ai-config',
        byId: (id: number) => `/api/ai-config/${id}`,
        bulk: '/api/ai-config/bulk'
      },
      systemPrompts: {
        base: '/api/system-prompts',
        byId: (id: number) => `/api/system-prompts/${id}`,
        bulk: '/api/system-prompts/bulk'
      },
      settings: {
        base: '/api/settings',
        operatingHours: '/operating-hours'
      },
      service: {
        base: '/api/service'
      },
      admin: {
        base: '/api/admin',
        users: '/users',
        invite: '/users/invite',
        userRole: (id: string) => `/users/${id}/role`,
        userAccess: (id: string) => `/users/${id}/access`,
        userById: (id: string) => `/users/${id}`,
        accessPolicy: '/access-policy',
        audit: '/audit',
        backup: '/backup',
        databaseSummary: '/database-summary',
        restore: '/restore',
        restoreUnits: '/restore/units',
        restoreValidate: '/restore/validate',
        restoreReset: '/restore/reset'
      }
    }
  }
};

export default config;
