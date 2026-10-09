/**
 * Case service: durable case lifecycle, rule checks, delivery options,
 * proposals. The agent/tools layer may only call these validated functions.
 */
import { Pool, PoolClient } from "pg";
import { db, currentTransaction } from "./db";
import { newId } from "./ids";
import type {
  AddressParts, CaseStatus, Channel, ContactPreference, DraftFields,
  RequestType, RuleCheckResult,
} from "./types";
import type { Locale } from "./i18n";
import { z } from "zod";

export const AddressSchema = z.object({
  raw: z.string().min(1).max(500),
  street: z.string().max(200).optional(),
  city: z.string().max(200).optional(),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/).optional(),
});
export const DraftFieldsSchema = z.object({
  address: AddressSchema.optional(),
  household: z.object({
    size: z.number().int().min(1).max(30).optional(),
    notes: z.string().max(500).optional(),
  }).optional(),
  availability: z.object({
    days: z.array(z.string()).default([]),
    times: z.array(z.string()).default([]),
    raw: z.string().max(500),
  }).optional(),
  contactPreference: z.enum(["callback", "status_link"]).optional(),
  contactName: z.string().max(200).optional(),
  contactPhone: z.string().regex(/^\d{10}$/).optional(),
  accommodation: z.string().max(500).optional(),
  dietaryAvoid: z.array(z.string().max(100)).optional(),
  dietaryNotes: z.string().max(500).optional(),
  equipment: z.object({
    stove: z.boolean().optional(),
    fridge: z.boolean().optional(),
    notes: z.string().max(500).optional(),
  }).optional(),
});

export interface CaseRow {
  nourish_managed?: boolean; nourish_client_id?: string | null; nourish_intake_id?: string | null;
  id: string; case_number: string; org_id: string; provider_id: string;
  request_id: string; type: RequestType; status: CaseStatus;
  owner_id: string | null; next_action_at: string | null;
  stated_need_by: string | null; verification_status: string;
  rule_check_result: RuleCheckResult | Record<string, never>;
  preferred_language: Locale; contact_preference: ContactPreference | null;
  accommodation_request: string | null; confirmed_fields: DraftFields;
  original_input: string | null; translated_summary: string | null;
  unknowns: string[]; version: number; created_at: string; updated_at: string;
  foodfit_visit_id: string | null; foodfit_visit_code: string | null;
  foodfit_basket: Array<{ productId: string; productName: string; unit: string; quantity: number; status: string }> | null;
}

function rowToCase(r: Record<string, unknown>): CaseRow {
  return r as unknown as CaseRow;
}

export async function recordEvent(
  caseId: string,
  actorType: "applicant" | "staff" | "system" | "worker",
  eventType: string,
  detail: Record<string, unknown> = {},
  actorId?: string,
  client?: Pool | PoolClient
): Promise<void> {
  const c = client ?? db();
  await c.query(
    `INSERT INTO case_events (id, case_id, actor_type, actor_id, event_type, detail)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [newId("evt"), caseId, actorType, actorId ?? null, eventType, JSON.stringify(detail)]
  );
}

async function nextCaseNumber(client: Pool | PoolClient): Promise<string> {
  const year = new Date().getFullYear();
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,2))',['mealline-case-number-'+year]);
  const r = await client.query(
    `SELECT count(*)::int AS n FROM assistance_cases WHERE case_number LIKE $1`,
    [`ML-${year}-%`]
  );
  const n = (r.rows[0] as { n: number }).n + 1;
  return `ML-${year}-${String(n).padStart(4, "0")}`;
}

export interface CreateCaseInput {
  orgId: string;
  providerId: string;
  type: RequestType;
  channel: Channel;
  language: Locale;
  draft: DraftFields;
  originalInput?: string;
  statedNeedBy?: string;
}

/** Create a service request + case in draft status from confirmed intake. */
export async function createCaseFromDraft(input: CreateCaseInput): Promise<CaseRow> {
  const parsed = DraftFieldsSchema.parse(input.draft);
  const inherited = currentTransaction();
  const client = inherited ?? await db().connect();
  try {
    if (!inherited) await client.query("BEGIN");
    const reqId = newId("req");
    const address = parsed.address ?? { raw: "" };
    await client.query(
      `INSERT INTO service_requests
        (id, provider_id, request_type, channel, preferred_language, contact_name,
         contact_phone, contact_preference, address, household, availability,
         accommodation_request, original_language_input)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        reqId, input.providerId, input.type, input.channel, input.language,
        parsed.contactName ?? null, parsed.contactPhone ?? null,
        parsed.contactPreference ?? null,
        JSON.stringify(address),
        JSON.stringify(parsed.household ?? {}),
        JSON.stringify(parsed.availability ?? { days: [], times: [], raw: "" }),
        parsed.accommodation && parsed.accommodation !== "none" ? parsed.accommodation : null,
        input.originalInput ?? null,
      ]
    );
    const caseId = newId("case");
    const caseNumber = await nextCaseNumber(client);
    const r = await client.query(
      `INSERT INTO assistance_cases
        (id, case_number, org_id, provider_id, request_id, type, status,
         preferred_language, contact_preference, accommodation_request,
         confirmed_fields, original_input)
       VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        caseId, caseNumber, input.orgId, input.providerId, reqId, input.type,
        input.language, parsed.contactPreference ?? null,
        parsed.accommodation && parsed.accommodation !== "none" ? parsed.accommodation : null,
        JSON.stringify(parsed), input.originalInput ?? null,
      ]
    );
    await recordEvent(caseId, "applicant", "intake_completed", { channel: input.channel }, undefined, client);
    if (!inherited) await client.query("COMMIT");
    return rowToCase(r.rows[0] as Record<string, unknown>);
  } catch (e) {
    if (!inherited) await client.query("ROLLBACK");
    throw e;
  } finally {
    if (!inherited) client.release();
  }
}

export async function getCase(id: string): Promise<CaseRow | null> {
  const r = await db().query(`SELECT * FROM assistance_cases WHERE id = $1`, [id]);
  return r.rows.length ? rowToCase(r.rows[0] as Record<string, unknown>) : null;
}

/** Org-scoped read: staff can never see another org's cases. */
export async function getCaseForOrg(id: string, orgId: string): Promise<CaseRow | null> {
  const r = await db().query(
    `SELECT * FROM assistance_cases WHERE id = $1 AND org_id = $2`, [id, orgId]
  );
  return r.rows.length ? rowToCase(r.rows[0] as Record<string, unknown>) : null;
}

export interface PolicyRow {
  id: string; provider_id: string; version: number;
  service_area: { zips?: string[] }; required_fields: string[];
  program_rules: { rule: string; source: string; reviewed: string }[];
  source: string;
}

export async function latestPolicy(providerId: string): Promise<PolicyRow | null> {
  const r = await db().query(
    `SELECT * FROM service_policies WHERE provider_id = $1 ORDER BY version DESC LIMIT 1`,
    [providerId]
  );
  if (!r.rows.length) return null;
  const p = r.rows[0] as Record<string, unknown>;
  return {
    id: p.id as string, provider_id: p.provider_id as string, version: p.version as number,
    service_area: p.service_area as { zips?: string[] },
    required_fields: p.required_fields as string[],
    program_rules: p.program_rules as { rule: string; source: string; reviewed: string }[],
    source: p.source as string,
  };
}

/**
 * Evaluate versioned demo program rules. Unknown/ambiguous details go to
 * staff review — the system never invents eligibility requirements (no age,
 * income, disability, or ID-document rules unless the policy states them).
 */
export async function checkServiceRules(caseId: string): Promise<RuleCheckResult> {
  const c = await getCase(caseId);
  if (!c) throw new Error("case_not_found");
  const policy = await latestPolicy(c.provider_id);
  if (!policy) throw new Error("no_policy");
  const fields = c.confirmed_fields ?? {};
  const notes: string[] = [];
  const requiredFields = policy.required_fields.map((field) => {
    let present = false;
    if (field === "address") present = !!(fields.address?.raw);
    else if (field === "household_size") present = fields.household?.size != null;
    else if (field === "contact_preference")
      present = fields.contactPreference === "callback" ? !!fields.contactPhone : !!fields.contactPreference;
    else present = false;
    return { field, present };
  });

  const zips = policy.service_area.zips ?? [];
  const zip = fields.address?.zip;
  let inServiceArea: RuleCheckResult["inServiceArea"];
  if (!zip) {
    inServiceArea = "unknown";
    notes.push("No ZIP code captured; service-area check needs staff review.");
  } else if (zips.includes(zip)) {
    inServiceArea = "pass";
  } else {
    inServiceArea = "fail";
    notes.push(`ZIP ${zip} is outside the demo service area.`);
  }

  const result: RuleCheckResult = {
    provider: policy.id, policyVersion: policy.version, inServiceArea,
    requiredFields, notes, checkedAt: new Date().toISOString(),
  };
  await db().query(
    `UPDATE assistance_cases SET rule_check_result = $1, updated_at = now() WHERE id = $2`,
    [JSON.stringify(result), caseId]
  );
  await recordEvent(caseId, "system", "rule_check", { result });
  return result;
}

export interface DeliveryOptionRow {
  id: string; provider_id: string; policy_version: number; label: string;
  window_start: string; window_end: string;
  capacity_total: number; capacity_reserved: number; active: boolean;
  note: string | null;
}

export async function listDeliveryOptions(caseId: string): Promise<DeliveryOptionRow[]> {
  const c = await getCase(caseId);
  if (!c) throw new Error("case_not_found");
  const r = await db().query(
    `SELECT * FROM delivery_options
     WHERE provider_id = $1 AND active = true AND window_end > now()
     ORDER BY window_start ASC`,
    [c.provider_id]
  );
  return r.rows as unknown as DeliveryOptionRow[];
}

/**
 * Create a proposal for a KNOWN option only. Unknown option ids are rejected,
 * never invented. A proposal is not a reservation and not an approval.
 */
export async function proposeDelivery(
  caseId: string, optionId: string, proposedBy?: string
): Promise<{ id: string }> {
  const c = await getCase(caseId);
  if (!c) throw new Error("case_not_found");
  const r = await db().query(
    `SELECT * FROM delivery_options WHERE id = $1 AND provider_id = $2`,
    [optionId, c.provider_id]
  );
  if (!r.rows.length) throw new Error("unknown_option");
  const opt = r.rows[0] as Record<string, unknown>;
  if (!opt.active) throw new Error("option_inactive");
  const pr = await db().query(
    `INSERT INTO delivery_proposals (id, case_id, option_id, option_snapshot, rationale, review_state, proposed_by)
     VALUES ($1,$2,$3,$4,$5,'proposed',$6) RETURNING id`,
    [newId("prop"), caseId, optionId, JSON.stringify(opt), "Staff/system proposed candidate slot.", proposedBy ?? null]
  );
  await recordEvent(caseId, proposedBy ? "staff" : "system", "option_proposed",
    { optionId, label: opt.label }, proposedBy);
  return { id: (pr.rows[0] as { id: string }).id };
}

/**
 * Move a confirmed draft into the staff queue. Required fields must be
 * present, or an explicit incomplete reason recorded for staff.
 */
export async function submitForReview(caseId: string, incompleteReason?: string): Promise<CaseRow> {
  const c = await getCase(caseId);
  if (!c) throw new Error("case_not_found");
  if (c.status !== "draft") throw new Error("invalid_state");
  const fields = c.confirmed_fields ?? {};
  const missing: string[] = [];
  if (!fields.address?.raw) missing.push("address");
  if (fields.household?.size == null) missing.push("household_size");
  if (!fields.contactPreference) missing.push("contact_preference");
  if (fields.contactPreference === "callback" && !fields.contactPhone) missing.push("contact_phone");
  if (missing.length && !incompleteReason) throw new Error("missing_required_fields");
  const r = await db().query(
    `UPDATE assistance_cases
     SET status = 'needs_review', unknowns = $1, version = version + 1, updated_at = now()
     WHERE id = $2 AND status = 'draft' RETURNING *`,
    [JSON.stringify(missing.length ? [...(c.unknowns ?? []), ...missing] : c.unknowns ?? []), caseId]
  );
  if (!r.rows.length) throw new Error("invalid_state");
  await recordEvent(caseId, "system", "submitted_for_review",
    { missing, incompleteReason: incompleteReason ?? null });
  return rowToCase(r.rows[0] as Record<string, unknown>);
}

/** Existing-request lookup path. Failure reveals nothing about stored records. */
export async function lookupRequest(
  reference: string, verification: { phoneLast4?: string; zip?: string }
): Promise<{ found: boolean }> {
  const ref = reference.trim();
  if (!ref) return { found: false };
  const r = await db().query(
    `SELECT sr.id, sr.contact_phone, sr.address
     FROM service_requests sr
     WHERE sr.external_reference = $1 OR sr.id = $1`,
    [ref]
  );
  if (!r.rows.length) return { found: false };
  const row = r.rows[0] as { contact_phone: string | null; address: AddressParts };
  const phoneOk = verification.phoneLast4
    ? (row.contact_phone ?? "").slice(-4) === verification.phoneLast4
    : false;
  const zipOk = verification.zip ? row.address?.zip === verification.zip : false;
  // Both factors required; on failure reveal nothing.
  return { found: phoneOk && zipOk };
}

export interface CaseListItem extends CaseRow {
  owner_name: string | null;
}

export async function listCases(
  orgId: string, statuses?: CaseStatus[]
): Promise<CaseListItem[]> {
  const params: unknown[] = [orgId];
  let where = `c.org_id = $1`;
  if (statuses?.length) {
    params.push(statuses);
    where += ` AND c.status = ANY($2)`;
  }
  const r = await db().query(
    `SELECT c.*, u.name AS owner_name
     FROM assistance_cases c LEFT JOIN staff_users u ON u.id = c.owner_id
     WHERE ${where} ORDER BY c.created_at DESC`,
    params
  );
  return r.rows as unknown as CaseListItem[];
}

export async function claimCase(caseId: string, staffUserId: string, orgId: string): Promise<CaseRow> {
  const r = await db().query(
    `UPDATE assistance_cases SET owner_id = $1, updated_at = now()
     WHERE id = $2 AND org_id = $3 RETURNING *`,
    [staffUserId, caseId, orgId]
  );
  if (!r.rows.length) throw new Error("not_found_or_forbidden");
  await recordEvent(caseId, "staff", "case_claimed", {}, staffUserId);
  return rowToCase(r.rows[0] as Record<string, unknown>);
}

export async function setNextAction(
  caseId: string, nextActionAt: string, status: "awaiting_followup" | "needs_review",
  staffUserId?: string, reason?: string
): Promise<void> {
  await db().query(
    `UPDATE assistance_cases SET next_action_at = $1, status = $2, version = version + 1, updated_at = now()
     WHERE id = $3`,
    [nextActionAt, status, caseId]
  );
  await recordEvent(caseId, staffUserId ? "staff" : "system", "followup_scheduled",
    { nextActionAt, status, reason: reason ?? null }, staffUserId);
}

/** Explicit outcome recording. Approval is never counted as fulfillment. */
export async function recordOutcome(
  caseId: string,
  outcome: "fulfilled" | "closed_without_service" | "cancelled",
  staffUserId: string,
  orgId: string,
  reason?: string
): Promise<CaseRow> {
  const r = await db().query(
    `UPDATE assistance_cases
     SET status = $1, version = version + 1, updated_at = now()
     WHERE id = $2 AND org_id = $3 AND status IN ('approved','awaiting_followup','needs_review')
       AND nourish_managed = false
     RETURNING *`,
    [outcome, caseId, orgId]
  );
  if (!r.rows.length) throw new Error("invalid_state_or_forbidden");
  await recordEvent(caseId, "staff", "outcome_recorded", { outcome, reason: reason ?? null }, staffUserId);
  return rowToCase(r.rows[0] as Record<string, unknown>);
}

export async function getEvents(caseId: string): Promise<Record<string, unknown>[]> {
  const r = await db().query(
    `SELECT id, case_id, actor_type, actor_id, event_type, detail, created_at
     FROM case_events WHERE case_id = $1 ORDER BY created_at ASC`, [caseId]
  );
  return r.rows as Record<string, unknown>[];
}

export async function getRequest(requestId: string): Promise<Record<string, unknown> | null> {
  const r = await db().query(`SELECT * FROM service_requests WHERE id = $1`, [requestId]);
  return (r.rows[0] as Record<string, unknown> | undefined) ?? null;
}
