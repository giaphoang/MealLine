// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { PrismaClient } from '@prisma/client';
import prisma from '../../db';

/**
 * Delete a non-visible Service import that never reached activation.
 *
 * Service tables intentionally use restrictive foreign keys because active
 * revision history must never cascade away. Pending cleanup is therefore
 * explicit and ordered. Source clients created only for the abandoned import
 * are removed after their last pending profile/encounter disappears.
 */
export async function cleanupPendingServiceImport(
  importId: number,
  source: string,
  client: PrismaClient = prisma,
): Promise<void> {
  await client.$executeRaw`
    DELETE FROM "ServicePersonProfileResponse"
    WHERE "profileRevisionId" IN (
      SELECT "id" FROM "ServicePersonProfileRevision" WHERE "importId" = ${importId}
    )`;
  await client.$executeRaw`
    DELETE FROM "ServiceClientProfileResponse"
    WHERE "profileRevisionId" IN (
      SELECT "id" FROM "ServiceClientProfileRevision" WHERE "importId" = ${importId}
    )`;
  await client.$executeRaw`
    DELETE FROM "ServiceQualityIssueDecision"
    WHERE "issueId" IN (
      SELECT "id" FROM "ServiceQualityIssue" WHERE "importId" = ${importId}
    )`;
  await client.serviceSourceResolution.deleteMany({
    where: { qualityIssue: { importId } },
  });
  await client.serviceQualityIssue.deleteMany({ where: { importId } });
  await client.serviceEncounterPerson.deleteMany({ where: { encounter: { importId } } });
  await client.servicePersonProfileRevision.deleteMany({ where: { importId } });
  await client.serviceClientProfileRevision.deleteMany({ where: { importId } });
  await client.serviceEncounterRevision.deleteMany({ where: { importId } });
  await client.serviceMetricObservationRevision.deleteMany({ where: { importId } });
  await client.serviceImport.deleteMany({ where: { id: importId, status: 'pending' } });
  await client.serviceClient.deleteMany({
    where: {
      source,
      encounters: { none: {} },
      profileRevisions: { none: {} },
    },
  });
  await client.servicePerson.deleteMany({
    where: {
      source,
      encounterLinks: { none: {} },
      profileRevisions: { none: {} },
    },
  });
}
