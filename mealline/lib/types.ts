import type { Locale } from "./i18n";

export type CaseStatus =
  | "draft" | "needs_review" | "awaiting_followup" | "approved"
  | "fulfilled" | "closed_without_service" | "cancelled";

export type RequestType = "new_delivery" | "missed_delivery" | "change";
export type Channel = "voice" | "text" | "sim";
export type ContactPreference = "callback" | "status_link";
export type StaffRole = "coordinator" | "staff";

export interface AddressParts {
  raw: string;
  street?: string;
  city?: string;
  zip?: string;
}

export interface HouseholdInfo {
  size?: number;
  notes?: string;
}

export interface AvailabilityInfo {
  days: string[];   // lowercase english day keys: monday..sunday
  times: string[];   // morning|afternoon|evening
  raw: string;
}

export interface DraftFields {
  address?: AddressParts;
  household?: HouseholdInfo;
  availability?: AvailabilityInfo;
  contactPreference?: ContactPreference;
  contactName?: string;
  contactPhone?: string;
  accommodation?: string;
  /** Foods to avoid: allergies or preferences, as stated. */
  dietaryAvoid?: string[];
  dietaryNotes?: string;
  /** Cooking/storage equipment, as stated. */
  equipment?: { stove?: boolean; fridge?: boolean; notes?: string };
}

export interface RuleCheckResult {
  provider: string;
  policyVersion: number;
  inServiceArea: "pass" | "unknown" | "fail";
  requiredFields: { field: string; present: boolean }[];
  notes: string[];
  checkedAt: string;
}

export interface IntakeStepDef {
  step: string;
  prompt: (locale: Locale) => string;
}

export const INTAKE_STEPS = [
  "language",
  "address",
  "household",
  "dietary",
  "equipment",
  "availability",
  "contact",
  "accommodation",
  "review",
] as const;
export type IntakeStep = (typeof INTAKE_STEPS)[number];

export function nextStep(step: IntakeStep): IntakeStep | null {
  const i = INTAKE_STEPS.indexOf(step);
  return i >= 0 && i < INTAKE_STEPS.length - 1 ? INTAKE_STEPS[i + 1] : null;
}
export function prevStep(step: IntakeStep): IntakeStep | null {
  const i = INTAKE_STEPS.indexOf(step);
  return i > 0 ? INTAKE_STEPS[i - 1] : null;
}
