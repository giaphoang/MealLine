import { describe, expect, test, vi } from 'vitest';
import {
  ALL_FLAGS,
  ANNOTATION_FLAGS,
  EXCLUSION_FLAGS,
  FLAG_DESCRIPTIONS,
  FLAG_FAMILY,
  type DataShapingRule,
  type ObservationContext,
  isExcluded,
  resolveFlags,
  ruleMatches,
  validateRule,
} from '../../../src/services/procurement/data-shaping';
import {
  createDataShapingRule,
  deleteDataShapingRule,
  listActiveDataShapingRules,
  updateDataShapingRule,
} from '../../../src/services/procurement';

const observation = (overrides: Partial<ObservationContext> = {}): ObservationContext => ({
  orderRevisionId: 1,
  source: 'ofb_pickup',
  deliveryDate: '2026-03-15',
  donorName: 'New Seasons - Slabtown',
  donorCode: 'RNS300',
  productCode: '41000',
  ...overrides,
});

const rule = (overrides: Partial<DataShapingRule> = {}): DataShapingRule => ({
  flag: 'pass_through',
  scope: 'donor',
  donorName: 'New Seasons - Slabtown',
  ...overrides,
});

describe('flag catalog', () => {
  test('every flag belongs to exactly one family, and the families are complete', () => {
    expect(new Set([...EXCLUSION_FLAGS, ...ANNOTATION_FLAGS]).size).toBe(ALL_FLAGS.length);
    for (const flag of EXCLUSION_FLAGS) expect(FLAG_FAMILY[flag]).toBe('exclusion');
    for (const flag of ANNOTATION_FLAGS) expect(FLAG_FAMILY[flag]).toBe('annotation');
    expect(Object.keys(FLAG_FAMILY).sort()).toEqual([...ALL_FLAGS].sort());
  });

  test('every flag is described for the people who have to choose one', () => {
    for (const flag of ALL_FLAGS) {
      expect(FLAG_DESCRIPTIONS[flag]).toBeTruthy();
    }
  });
});

describe('the exclusion vocabulary is deliberately narrow', () => {
  test('only pass_through and other_exclusion can remove weight from a total', () => {
    // A one-off donation can still be food and must count; non-food is already
    // a product category, so re-encoding it as an exclusion flag would double
    // count the same fact. Everything else unforeseen goes through
    // other_exclusion, which must explain itself.
    expect([...EXCLUSION_FLAGS]).toEqual(['pass_through', 'other_exclusion']);
  });

  test('other_exclusion demands an explanation, since it is the open-ended one', () => {
    const unexplained = { flag: 'other_exclusion', scope: 'donor', donorName: 'Someone' };
    expect(validateRule(unexplained as DataShapingRule)).toContain(
      'An "other exclusion" rule requires a note explaining what is excluded and why.'
    );
    expect(
      validateRule({ ...unexplained, note: 'Spoiled on arrival; never distributed.' } as DataShapingRule)
    ).toEqual([]);
  });
});

describe('donor rules match on either identifier', () => {
  test('an OFB donor code matches even when the name has drifted', () => {
    // Names demonstrably drift between exports (Amazon OUR1/OUR2); codes do not.
    const byCode = { flag: 'pass_through', scope: 'donor', donorCode: 'RNS300' } as DataShapingRule;
    expect(ruleMatches(byCode, observation({ donorName: 'New Seasons — Slabtown (NW)' }))).toBe(true);
    expect(ruleMatches(byCode, observation({ donorCode: 'RAZ100' }))).toBe(false);
  });

  test('a name-only rule still reaches rows that carry no code', () => {
    expect(ruleMatches(rule(), observation({ donorCode: null }))).toBe(true);
  });

  test('either identifier hitting is enough when a rule carries both', () => {
    const both = rule({ donorCode: 'RNS300' });
    expect(ruleMatches(both, observation({ donorCode: 'CHANGED' }))).toBe(true);
    expect(ruleMatches(both, observation({ donorName: 'Renamed Entirely' }))).toBe(true);
    expect(
      ruleMatches(both, observation({ donorCode: 'CHANGED', donorName: 'Renamed Entirely' }))
    ).toBe(false);
  });

  test('codes compare case- and whitespace-tolerantly', () => {
    const byCode = { flag: 'pass_through', scope: 'donor', donorCode: 'rns300' } as DataShapingRule;
    expect(ruleMatches(byCode, observation({ donorCode: ' RNS300 ' }))).toBe(true);
  });
});

describe('rule validation', () => {
  test('each scope requires its own primary matcher', () => {
    expect(validateRule(rule({ scope: 'donor', donorName: null }))).toContain(
      'A donor rule requires donorName, donorCode, or both.'
    );
    expect(validateRule(rule({ scope: 'category', donorName: null }))).toContain(
      'A category rule requires productCode.'
    );
    expect(validateRule(rule({ scope: 'event', donorName: null }))).toContain(
      'An event rule requires orderRevisionId.'
    );
    expect(validateRule(rule({ scope: 'date_range', donorName: null }))).toContain(
      'A date-range rule requires startDate, endDate, or both.'
    );
  });

  test('accepts a well-formed rule of each scope', () => {
    expect(validateRule(rule())).toEqual([]);
    expect(validateRule({ flag: 'estimated', scope: 'category', productCode: '99000' })).toEqual([]);
    expect(validateRule({ flag: 'at_risk', scope: 'event', orderRevisionId: 42 })).toEqual([]);
    expect(
      validateRule({ flag: 'program_bound', scope: 'date_range', startDate: '2020-03-01' })
    ).toEqual([]);
  });

  test('rejects an unknown flag or scope rather than silently ignoring it', () => {
    const bad = validateRule({ flag: 'made_up', scope: 'nonsense' } as unknown as DataShapingRule);
    expect(bad).toContain('Unknown flag "made_up".');
    expect(bad).toContain('Unknown scope "nonsense".');
  });

  test('rejects an inverted date range', () => {
    expect(
      validateRule(rule({ startDate: '2026-06-01', endDate: '2026-01-01' }))
    ).toContain('startDate must not be after endDate.');
  });
});

describe('rule matching', () => {
  test('a donor rule matches that donor and no other', () => {
    expect(ruleMatches(rule(), observation())).toBe(true);
    expect(ruleMatches(rule(), observation({ donorName: "Trader Joe's - Northwest" }))).toBe(false);
  });

  test('donor matching tolerates case and whitespace drift without inferring identity', () => {
    expect(ruleMatches(rule(), observation({ donorName: 'new seasons - slabtown' }))).toBe(true);
    expect(ruleMatches(rule(), observation({ donorName: '  New  Seasons - Slabtown  ' }))).toBe(true);
  });

  test('a donor rule never matches an observation with no donor on file', () => {
    // Absence of a donor is a reported fact, not a wildcard (D4).
    expect(ruleMatches(rule(), observation({ donorName: null }))).toBe(false);
  });

  test('a disabled rule matches nothing', () => {
    expect(ruleMatches(rule({ enabled: false }), observation())).toBe(false);
  });

  test('omitting source spans every namespace; naming one narrows to it', () => {
    // This is what lets a single New Seasons rule cover live OFB data and
    // legacy history at once, without being restated (D21).
    expect(ruleMatches(rule(), observation({ source: 'ofb_pickup' }))).toBe(true);
    expect(ruleMatches(rule(), observation({ source: 'legacy_community' }))).toBe(true);
    expect(
      ruleMatches(rule({ source: 'legacy_community' }), observation({ source: 'ofb_pickup' }))
    ).toBe(false);
  });

  test('date narrowers are inclusive on both bounds', () => {
    const bounded = rule({ startDate: '2026-03-01', endDate: '2026-03-31' });
    expect(ruleMatches(bounded, observation({ deliveryDate: '2026-03-01' }))).toBe(true);
    expect(ruleMatches(bounded, observation({ deliveryDate: '2026-03-31' }))).toBe(true);
    expect(ruleMatches(bounded, observation({ deliveryDate: '2026-02-28' }))).toBe(false);
    expect(ruleMatches(bounded, observation({ deliveryDate: '2026-04-01' }))).toBe(false);
  });

  test('a category rule addresses the line, not the event', () => {
    const byCategory = { flag: 'estimated', scope: 'category', productCode: '99000' } as DataShapingRule;
    expect(ruleMatches(byCategory, observation({ productCode: '99000' }))).toBe(true);
    expect(ruleMatches(byCategory, observation({ productCode: '41000' }))).toBe(false);
    // Legacy monthly rows carry no product detail, so category rules pass them by.
    expect(ruleMatches(byCategory, observation({ productCode: null }))).toBe(false);
  });

  test('an event rule matches exactly one observation', () => {
    const once = { flag: 'at_risk', scope: 'event', orderRevisionId: 7 } as DataShapingRule;
    expect(ruleMatches(once, observation({ orderRevisionId: 7 }))).toBe(true);
    expect(ruleMatches(once, observation({ orderRevisionId: 8 }))).toBe(false);
  });

  test('a date-range rule matches anything inside the window regardless of donor', () => {
    const cfap = {
      flag: 'program_bound',
      scope: 'date_range',
      startDate: '2020-05-01',
      endDate: '2021-05-31',
    } as DataShapingRule;
    expect(ruleMatches(cfap, observation({ deliveryDate: '2020-09-14', donorName: 'Anyone' }))).toBe(
      true
    );
    expect(ruleMatches(cfap, observation({ deliveryDate: '2026-03-15' }))).toBe(false);
  });
});

describe('flag resolution', () => {
  test('collects every applicable flag, deduped and in a stable order', () => {
    const rules: DataShapingRule[] = [
      rule({ flag: 'at_risk' }),
      rule({ flag: 'pass_through' }),
      // A second, independent reason for the same flag is not an error.
      { flag: 'pass_through', scope: 'event', orderRevisionId: 1 },
    ];
    expect(resolveFlags(rules, observation())).toEqual(['pass_through', 'at_risk']);
  });

  test('returns nothing when no rule applies, leaving the observation untouched', () => {
    expect(resolveFlags([rule()], observation({ donorName: 'Fred Meyer - Stadium' }))).toEqual([]);
  });
});

describe('exclusion decisions', () => {
  test('only honored exclusion flags remove an observation from a metric', () => {
    expect(isExcluded(['pass_through'], ['pass_through'])).toBe(true);
    expect(isExcluded(['pass_through'], ['other_exclusion'])).toBe(false);
    expect(isExcluded([], ['pass_through'])).toBe(false);
  });

  test('annotation flags never exclude, even if a caller asks them to', () => {
    // at_risk and estimated describe supply; they must not quietly move a
    // number the agency already reported.
    expect(isExcluded(['at_risk', 'estimated'], ['at_risk', 'estimated'])).toBe(false);
  });
});

describe('the New Seasons case, end to end (D21)', () => {
  // WTH couriers New Seasons to another agency: a real event, but not this
  // pantry's inventory. One donor rule, authored once, must reach both the
  // live OFB record and the legacy history.
  const passThrough = rule({ note: 'Couriered to another agency; WTH does not distribute it.' });

  const live = observation({ source: 'ofb_pickup', deliveryDate: '2026-03-15' });
  const legacy = observation({
    source: 'legacy_community',
    deliveryDate: '2019-11-01',
    productCode: null,
  });
  const other = observation({ donorName: 'Amazon - NW Industrial (Prime Now)' });

  test('applies to both namespaces from a single rule', () => {
    expect(resolveFlags([passThrough], live)).toEqual(['pass_through']);
    expect(resolveFlags([passThrough], legacy)).toEqual(['pass_through']);
  });

  test('separates "received" from "retained inventory" without touching the event', () => {
    const flags = resolveFlags([passThrough], live);
    // "Total received" honors no exclusions — the donation really happened.
    expect(isExcluded(flags, [])).toBe(false);
    // "Retained inventory" honors pass_through — WTH never distributed it.
    expect(isExcluded(flags, ['pass_through'])).toBe(true);
  });

  test('leaves every other donor entirely alone', () => {
    expect(resolveFlags([passThrough], other)).toEqual([]);
    expect(isExcluded(resolveFlags([passThrough], other), ['pass_through'])).toBe(false);
  });
});

describe('rule persistence', () => {
  // An injected client keeps these deterministic and out of the dev database,
  // matching how the rest of the procurement service is tested.
  const stubClient = (rows: Record<string, unknown>[] = []) => {
    const store = [...rows];
    return {
      store,
      procurementDataRule: {
        findMany: vi.fn(async ({ where }: { where?: { enabled?: boolean } } = {}) =>
          where?.enabled === undefined ? store : store.filter((r) => r.enabled === where.enabled)
        ),
        findUnique: vi.fn(async ({ where }: { where: { id: number } }) =>
          store.find((r) => r.id === where.id) ?? null
        ),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: store.length + 1, createdAt: new Date(), updatedAt: new Date(), ...data };
          store.push(row);
          return row;
        }),
        update: vi.fn(async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
          const row = store.find((r) => r.id === where.id)!;
          Object.assign(row, data, { updatedAt: new Date() });
          return row;
        }),
        delete: vi.fn(async ({ where }: { where: { id: number } }) => {
          const index = store.findIndex((r) => r.id === where.id);
          return store.splice(index, 1)[0];
        }),
      },
    };
  };

  const baseRow = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    flag: 'pass_through',
    scope: 'donor',
    donorName: 'New Seasons - Slabtown',
    donorCode: null,
    productCode: null,
    orderRevisionId: null,
    source: null,
    startDate: null,
    endDate: null,
    enabled: true,
    note: null,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  test('creates a well-formed rule and records who authored it', async () => {
    const client = stubClient();
    const created = await createDataShapingRule(
      { flag: 'pass_through', scope: 'donor', donorName: 'New Seasons - Slabtown' },
      'user-1',
      client as never
    );
    expect(created.flag).toBe('pass_through');
    expect(created.createdBy).toBe('user-1');
    expect(client.store).toHaveLength(1);
  });

  test('refuses to persist a malformed rule', async () => {
    const client = stubClient();
    await expect(
      createDataShapingRule({ flag: 'pass_through', scope: 'donor' }, undefined, client as never)
    ).rejects.toThrow(/requires donorName/);
    expect(client.store).toHaveLength(0);
  });

  test('validates the merged result of a partial edit, not just the changed fields', async () => {
    // Clearing the donor from a donor-scoped rule would leave it matching
    // nothing coherent, so the merge is validated as a whole.
    const client = stubClient([baseRow()]);
    await expect(
      updateDataShapingRule(1, { donorName: null }, client as never)
    ).rejects.toThrow(/requires donorName/);
  });

  test('disabling a rule keeps it, so the interpretation can be restored', async () => {
    const client = stubClient([baseRow()]);
    const updated = await updateDataShapingRule(1, { enabled: false }, client as never);
    expect(updated.enabled).toBe(false);
    expect(client.store).toHaveLength(1);
  });

  test('only enabled rules are offered to Analytics', async () => {
    const client = stubClient([baseRow(), baseRow({ id: 2, enabled: false })]);
    const active = await listActiveDataShapingRules(client as never);
    expect(active.map((rule) => rule.id)).toEqual([1]);
  });

  test('editing or deleting a missing rule reports it rather than failing silently', async () => {
    const client = stubClient();
    await expect(updateDataShapingRule(99, { enabled: false }, client as never)).rejects.toThrow(
      /no longer exists/
    );
    await expect(deleteDataShapingRule(99, client as never)).rejects.toThrow(/no longer exists/);
  });

  test('deleting a rule removes only the interpretation', async () => {
    const client = stubClient([baseRow()]);
    await deleteDataShapingRule(1, client as never);
    expect(client.store).toHaveLength(0);
  });
});
