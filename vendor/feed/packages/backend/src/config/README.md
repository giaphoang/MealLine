# AI Usage Controls

FEED keeps three different concepts separate:

- `AIConfiguration.tokensPerMinute`, `requestsPerMinute`, and
  `requestsPerDay` record provider/account allowances. They support monitoring
  and do not become daily or monthly token budgets.
- `AIConfiguration.dailyCostLimit` and `monthlyCostLimit` are explicit spend
  controls. `LimitEnforcementService` evaluates them against `UsageRecord`
  before each provider request.
- `TOKEN_LIMITS.RATE_LIMITS` protects FEED's import endpoints from short local
  bursts. It is an application middleware limit, not a provider entitlement
  and not a dashboard fallback.

Model ids, prices, context windows, output ceilings, and optional provider
rate allowances belong in `services/ai/catalogue.ts`. A missing value stays
missing or is represented as zero in an API response; do not substitute a
plausible model, price, or allowance.

FEED currently has no explicit daily or monthly token-budget fields. If that
feature is added, it needs its own persisted settings, validation, UI labels,
and tests. Do not infer it by multiplying TPM by minutes in a day.

Translation response-time alert thresholds live in `translation.ts`.

Any change to limits or prices must update tests and the model-catalogue
documentation, then be validated against the provider's current official
documentation before release.
