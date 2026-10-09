/** Client-facing phone protocol. Authorization and consent are supplied by controllers, never models. */
export type PhoneLocale = 'en' | 'es' | 'vi';
export interface ClientProfile {
  name?: string | null;
  phone?: string | null;
  language?: PhoneLocale | null;
  addressRaw?: string | null;
  addressStreet?: string | null;
  addressCity?: string | null;
  addressZip?: string | null;
  householdSize?: number | null;
  dietaryAvoid?: string[];
  dietaryNotes?: string | null;
  hasStove?: boolean | null;
  hasFridge?: boolean | null;
  availabilityRaw?: string | null;
  availabilityDays?: string[];
  availabilityTimes?: string[];
  contactPreference?: 'callback' | 'status_link' | null;
  accommodation?: string | null;
}
export interface NotificationConsent { enabled: boolean; channel: 'sms' | 'voice_callback' | 'none'; at: string }
export interface CallerGrant { clientId: string; callId: string; phone: string; verifiedAt: string; expiresAt: string; signature: string }
export interface PhoneClient {
  id: string; reference: string; profile: ClientProfile; phone: string | null;
  phoneVerifiedAt: string | null; version: number; consent: NotificationConsent;
  mergedIntoId: string | null; createdAt: string; updatedAt: string;
}
export interface PhoneStatus {
  intakeId: string; caseNumber: string;
  status: 'staff_review' | 'approved' | 'packed' | 'scheduled' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'needs_followup';
  scheduledFor: string | null; updatedAt: string; reviewHold: boolean; timeZone?: string;
}
export interface PhoneCallRecord {
  id: string; clientId?: string | null; callSid?: string | null; caseNumber?: string | null;
  language: PhoneLocale; status: 'draft' | 'confirmed' | 'abandoned' | 'needs_followup';
  profile: ClientProfile; summary: string;
  transcript: Array<{ step: string; input: string | null; reply: string; at: string }>;
  observedAt?: string;
}
export interface PhoneCommand {
  id: string; callId: string;
  kind: 'resolve_client' | 'read_client' | 'save_draft' | 'submit_request' | 'update_client' | 'get_status' | 'request_change' | 'report_missed_delivery' | 'request_human' | 'notification_context';
  clientId?: string; grant?: CallerGrant; newPhoneGrant?: CallerGrant; expectedVersion?: number;
  confirmedAt?: string; phoneVerifiedAt?: string;
  profile?: ClientProfile; consent?: NotificationConsent; call?: PhoneCallRecord;
  caseNumber?: string; intakeId?: string; reference?: string; phone?: string;
  reason?: string; changeType?: 'delivery_change' | 'cancellation' | 'safety_review';
}
export interface PhoneCommandResult {
  client?: PhoneClient; statuses?: PhoneStatus[];
  intakeId?: string; shoppingListId?: number; matchedCount?: number;
  changeId?: string; queuedForReview?: boolean;
  target?: { clientId: string; phone: string; reference: string };
  referenceRequired?: boolean;
  notification?: { phone: string; language: PhoneLocale; consent: NotificationConsent; statuses: PhoneStatus[] } | null;
}
export interface ClientAnalytics {
  source: 'mealline'; startDate: string; endDate: string;
  registeredHouseholds: number; requestedHouseholds: number; requests: number;
  servedHouseholds: number; completedDeliveries: number;
  householdSizes: Array<{ label: string; count: number }>;
  postalCodes: Array<{ label: string; count: number }>;
  preferredCallLanguages: Array<{ label: string; count: number }>;
}
