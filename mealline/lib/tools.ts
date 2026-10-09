/**
 * Validated tool dispatcher. The model proposes tool calls; this module
 * validates arguments, enforces the allow-list, and authorizes each action.
 * Unknown tools/options are rejected, never improvised.
 */
import { z } from "zod";
import {
  checkServiceRules, listDeliveryOptions, lookupRequest, proposeDelivery,
  recordEvent, submitForReview, setNextAction, DraftFieldsSchema,
} from "./cases";
import { db } from "./db";
import type { Channel } from "./types";

export const TOOL_ALLOWLIST = [
  "capture_intake",
  "check_service_rules",
  "lookup_request",
  "list_delivery_options",
  "propose_delivery",
  "submit_for_review",
  "request_human",
] as const;
export type ToolName = (typeof TOOL_ALLOWLIST)[number];

export class ToolRejectedError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface ToolContext {
  caseId?: string;
  sessionId?: string;
  orgId: string;
  actor: "applicant" | "staff" | "system";
  actorId?: string;
  channel: Channel;
}

const Schemas: Record<ToolName, z.ZodTypeAny> = {
  capture_intake: z.object({
    fields: DraftFieldsSchema,
    unknowns: z.array(z.string()).default([]),
  }),
  check_service_rules: z.object({ case_id: z.string().min(1) }),
  lookup_request: z.object({
    reference: z.string().min(1).max(100),
    verification: z.object({
      phoneLast4: z.string().regex(/^\d{4}$/).optional(),
      zip: z.string().regex(/^\d{5}$/).optional(),
    }),
  }),
  list_delivery_options: z.object({ case_id: z.string().min(1) }),
  propose_delivery: z.object({
    case_id: z.string().min(1),
    option_id: z.string().min(1),
  }),
  submit_for_review: z.object({
    case_id: z.string().min(1),
    incomplete_reason: z.string().max(500).optional(),
  }),
  request_human: z.object({
    case_id: z.string().min(1).optional(),
    reason: z.string().max(500).default("applicant_requested"),
    needed_language: z.string().max(60).optional(),
  }),
};

/** Save caller-reported details as provisional (draft/session) state. */
async function captureIntake(
  ctx: ToolContext,
  args: z.infer<(typeof Schemas)["capture_intake"]>
): Promise<{ ok: true }> {
  if (!ctx.sessionId && !ctx.caseId) {
    throw new ToolRejectedError("no_target", "capture_intake needs a session or case");
  }
  if (ctx.sessionId) {
    const r = await db().query(
      `SELECT draft_fields FROM conversation_sessions WHERE id = $1`, [ctx.sessionId]
    );
    const current = (r.rows[0]?.draft_fields as Record<string, unknown>) ?? {};
    const merged = { ...current, ...args.fields };
    await db().query(
      `UPDATE conversation_sessions
       SET draft_fields = $1::jsonb, updated_at = now() WHERE id = $2`,
      [JSON.stringify(merged), ctx.sessionId]
    );
  }
  if (ctx.caseId) {
    const cur = await db().query(
      `SELECT confirmed_fields, unknowns FROM assistance_cases WHERE id = $1`, [ctx.caseId]
    );
    const confirmed = (cur.rows[0]?.confirmed_fields as Record<string, unknown>) ?? {};
    const unknowns = (cur.rows[0]?.unknowns as string[]) ?? [];
    const mergedUnknowns = [...new Set([...unknowns, ...args.unknowns])];
    await db().query(
      `UPDATE assistance_cases
       SET confirmed_fields = $1::jsonb, unknowns = $2::jsonb,
           version = version + 1, updated_at = now()
       WHERE id = $3`,
      [JSON.stringify({ ...confirmed, ...args.fields }), JSON.stringify(mergedUnknowns), ctx.caseId]
    );
    await recordEvent(ctx.caseId, ctx.actor, "intake_captured",
      { fields: Object.keys(args.fields), unknowns: args.unknowns }, ctx.actorId);
  }
  return { ok: true };
}

async function requestHuman(
  ctx: ToolContext,
  args: z.infer<(typeof Schemas)["request_human"]>
): Promise<{ ok: true; mode: "transfer" | "callback" }> {
  const mode = ctx.channel === "voice" ? "transfer" : "callback";
  if (ctx.caseId) {
    const nextAction = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
    await setNextAction(ctx.caseId, nextAction, "awaiting_followup", undefined,
      `human_requested: ${args.reason}`);
    await recordEvent(ctx.caseId, "system", "human_requested", {
      reason: args.reason,
      neededLanguage: args.needed_language ?? null,
      mode,
    });
  }
  if (ctx.sessionId) {
    await db().query(
      `UPDATE conversation_sessions SET status = $1, updated_at = now() WHERE id = $2`,
      [mode === "transfer" ? "transferred" : "callback", ctx.sessionId]
    );
  }
  return { ok: true, mode };
}

export async function dispatchTool(
  name: string,
  rawArgs: unknown,
  ctx: ToolContext
): Promise<unknown> {
  if (!(TOOL_ALLOWLIST as readonly string[]).includes(name)) {
    if (ctx.caseId) {
      await recordEvent(ctx.caseId, "system", "tool_rejected",
        { tool: name, reason: "unknown_tool" }).catch(() => undefined);
    }
    throw new ToolRejectedError("unknown_tool", `Tool "${name}" is not permitted`);
  }
  const tool = name as ToolName;
  const parsed = Schemas[tool].safeParse(rawArgs);
  if (!parsed.success) {
    throw new ToolRejectedError("invalid_args", `Invalid arguments for ${name}: ${parsed.error.message}`);
  }
  const args = parsed.data as never;
  switch (tool) {
    case "capture_intake":
      return captureIntake(ctx, args as z.infer<(typeof Schemas)["capture_intake"]>);
    case "check_service_rules": {
      const a = args as z.infer<(typeof Schemas)["check_service_rules"]>;
      if (a.case_id !== ctx.caseId) throw new ToolRejectedError("scope", "case_id mismatch");
      return checkServiceRules(a.case_id);
    }
    case "lookup_request": {
      const a = args as z.infer<(typeof Schemas)["lookup_request"]>;
      return lookupRequest(a.reference, a.verification);
    }
    case "list_delivery_options": {
      const a = args as z.infer<(typeof Schemas)["list_delivery_options"]>;
      if (a.case_id !== ctx.caseId) throw new ToolRejectedError("scope", "case_id mismatch");
      return listDeliveryOptions(a.case_id);
    }
    case "propose_delivery": {
      const a = args as z.infer<(typeof Schemas)["propose_delivery"]>;
      if (a.case_id !== ctx.caseId) throw new ToolRejectedError("scope", "case_id mismatch");
      try {
        return await proposeDelivery(a.case_id, a.option_id, ctx.actorId);
      } catch (e) {
        throw new ToolRejectedError("unknown_option", e instanceof Error ? e.message : "rejected");
      }
    }
    case "submit_for_review": {
      const a = args as z.infer<(typeof Schemas)["submit_for_review"]>;
      if (a.case_id !== ctx.caseId) throw new ToolRejectedError("scope", "case_id mismatch");
      return submitForReview(a.case_id, a.incomplete_reason);
    }
    case "request_human":
      return requestHuman(ctx, args as z.infer<(typeof Schemas)["request_human"]>);
    default:
      throw new ToolRejectedError("unknown_tool", `Tool "${name}" is not permitted`);
  }
}
