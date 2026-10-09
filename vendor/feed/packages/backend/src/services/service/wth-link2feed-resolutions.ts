// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { link2FeedVisitSourceRecordKey } from './adapters/link2feed-visits';

export interface WthLink2FeedResolutionPreset {
  sourceRecordKey: string;
  issueCode: string;
  action: 'apply_source_resolution';
  recordKind: 'special_event_people_aggregate';
  reportedHouseholdCount: null;
  reportedPeopleCount: number;
  eventLabel: string;
  reason: string;
}

// WTH operational context, deliberately outside the reusable Link2Feed parser.
// Another agency gets no date/value exception from link2feed_visits_v1; it may
// author its own resolution through the same review mechanism.
export const WTH_LINK2FEED_RESOLUTION_PRESETS: readonly WthLink2FeedResolutionPreset[] = [
  {
    sourceRecordKey: link2FeedVisitSourceRecordKey('45985', '45986.67403', null),
    issueCode: 'UNUSUALLY_LARGE_REPORTED_PEOPLE_COUNT',
    action: 'apply_source_resolution',
    recordKind: 'special_event_people_aggregate',
    reportedHouseholdCount: null,
    reportedPeopleCount: 264,
    eventLabel: 'WTH Thanksgiving outdoor market',
    reason: 'WTH staff confirmed this source observation is the Thanksgiving outdoor-market people clicker tally.',
  },
] as const;
