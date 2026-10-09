import { describe, expect, test, vi } from 'vitest';
import {
  DEFAULT_OPERATING_HOURS,
  getAppliedOperatingHoursRevisions,
  getOperatingHoursSettings,
  operatingHoursRevisionForDate,
  operatingHoursSettingsInputSchema,
  saveOperatingHoursSettings,
  serviceWindowForDate,
} from '../../../src/services/operating-hours';

describe('organization operating hours', () => {
  test('defaults to Tuesday through Thursday from 11:00 to 14:00 Pacific', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const settings = await getOperatingHoursSettings({
      operatingHoursRevision: { findFirst },
    } as never);

    expect(settings.timezone).toBe('America/Los_Angeles');
    expect(settings.hours.tuesday).toEqual({
      isOpen: true,
      openTime: '11:00',
      closeTime: '14:00',
    });
    expect(settings.hours.monday.isOpen).toBe(false);
    expect(settings.hours.friday.isOpen).toBe(false);
  });

  test('requires all seven days, exact times, and a valid IANA timezone', () => {
    expect(() => operatingHoursSettingsInputSchema.parse({
      timezone: 'Not/A_Timezone',
      hours: DEFAULT_OPERATING_HOURS,
    })).toThrow();
    expect(() => operatingHoursSettingsInputSchema.parse({
      timezone: 'America/Los_Angeles',
      hours: {
        ...DEFAULT_OPERATING_HOURS,
        tuesday: { isOpen: true, openTime: '9:00', closeTime: '14:00' },
      },
    })).toThrow();
    expect(() => operatingHoursSettingsInputSchema.parse({
      timezone: 'America/Los_Angeles',
      hours: {
        ...DEFAULT_OPERATING_HOURS,
        tuesday: { isOpen: true, openTime: '14:00', closeTime: '11:00' },
      },
    })).toThrow();
  });

  test('retains closed-day times while excluding the day from service windows', () => {
    expect(serviceWindowForDate('2026-07-13', {
      timezone: 'America/Los_Angeles',
      hours: DEFAULT_OPERATING_HOURS,
    })).toBeNull();

    const tuesday = serviceWindowForDate('2026-07-14', {
      timezone: 'America/Los_Angeles',
      hours: DEFAULT_OPERATING_HOURS,
    });
    expect(tuesday?.start.toISOString()).toBe('2026-07-14T18:00:00.000Z');
    expect(tuesday?.end.toISOString()).toBe('2026-07-14T21:00:00.000Z');
  });

  test('appends an effective-today revision without user ownership', async () => {
    const recordedAt = new Date('2026-07-14T05:00:00.000Z');
    const findFirst = vi.fn().mockResolvedValue({
      id: 1, effectiveDate: '1970-01-01',
      timezone: 'America/Los_Angeles',
      hours: DEFAULT_OPERATING_HOURS,
      revisionKind: 'migration_baseline', recordedAt: new Date(0),
    });
    const changedHours = {
      ...DEFAULT_OPERATING_HOURS,
      friday: { isOpen: true, openTime: '11:00', closeTime: '14:00' },
    };
    const create = vi.fn().mockResolvedValue({
      id: 2, effectiveDate: '2026-07-13',
      timezone: 'America/Los_Angeles', hours: changedHours,
      revisionKind: 'updated', recordedAt,
    });

    const saved = await saveOperatingHoursSettings({
      timezone: 'America/Los_Angeles',
      hours: changedHours,
    }, { operatingHoursRevision: { findFirst, create } } as never, recordedAt);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        effectiveDate: '2026-07-13',
        revisionKind: 'updated',
      }),
    });
    expect(saved).toMatchObject({
      revisionId: 2,
      effectiveDate: '2026-07-13',
      updatedAt: recordedAt.toISOString(),
    });
  });

  test('does not append a revision when the submitted schedule is unchanged', async () => {
    const row = {
      id: 4, effectiveDate: '2026-07-01',
      timezone: 'America/Los_Angeles', hours: DEFAULT_OPERATING_HOURS,
      revisionKind: 'updated', recordedAt: new Date('2026-07-01T12:00:00Z'),
    };
    const findFirst = vi.fn().mockResolvedValue(row);
    const create = vi.fn();
    const saved = await saveOperatingHoursSettings({
      timezone: row.timezone,
      hours: row.hours,
    }, { operatingHoursRevision: { findFirst, create } } as never);

    expect(create).not.toHaveBeenCalled();
    expect(saved.revisionId).toBe(4);
  });

  test('selects the final same-day correction and preserves the range anchor', async () => {
    const rows = [
      {
        id: 1, effectiveDate: '1970-01-01', timezone: 'America/Los_Angeles',
        hours: DEFAULT_OPERATING_HOURS, revisionKind: 'migration_baseline',
        recordedAt: new Date('2026-07-01T10:00:00Z'),
      },
      {
        id: 2, effectiveDate: '2026-07-15', timezone: 'America/Los_Angeles',
        hours: { ...DEFAULT_OPERATING_HOURS, monday: { isOpen: true, openTime: '10:00', closeTime: '13:00' } },
        revisionKind: 'updated', recordedAt: new Date('2026-07-14T18:00:00Z'),
      },
      {
        id: 3, effectiveDate: '2026-07-15', timezone: 'America/Los_Angeles',
        hours: { ...DEFAULT_OPERATING_HOURS, monday: { isOpen: true, openTime: '09:00', closeTime: '13:00' } },
        revisionKind: 'updated', recordedAt: new Date('2026-07-14T18:05:00Z'),
      },
    ];
    const findMany = vi.fn().mockResolvedValue(rows);
    const revisions = await getAppliedOperatingHoursRevisions(
      '2026-07-10', '2026-07-20',
      { operatingHoursRevision: { findMany } } as never
    );

    expect(revisions.map((revision) => revision.revisionId)).toEqual([1, 3]);
    expect(operatingHoursRevisionForDate('2026-07-14', revisions).revisionId).toBe(1);
    expect(operatingHoursRevisionForDate('2026-07-15', revisions).revisionId).toBe(3);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { effectiveDate: { lte: '2026-07-20' } },
    }));
  });
});
