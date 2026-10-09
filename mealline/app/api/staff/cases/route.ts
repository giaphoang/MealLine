import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/staffApi";
import { listCases } from "@/lib/cases";
import type { CaseStatus } from "@/lib/types";

const ACTIVE: CaseStatus[] = ["needs_review", "awaiting_followup", "approved"];

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);
  if ("error" in auth) return auth.error;
  const status = new URL(req.url).searchParams.get("status");
  const statuses = status ? (status.split(",") as CaseStatus[]) : ACTIVE;
  const cases = await listCases(auth.staff.orgId, statuses);
  return NextResponse.json({
    cases: cases.map((c) => ({
      id: c.id, caseNumber: c.case_number, type: c.type, status: c.status,
      owner: c.owner_name, nextActionAt: c.next_action_at,
      language: c.preferred_language, age: c.created_at,
      ruleCheck: c.rule_check_result,
      unknowns: c.unknowns,
    })),
  });
}
