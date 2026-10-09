import type { FoodItem, VoiceIntake, ShoppingList, ShoppingListItem, Delivery, PhoneClient, ClientProfile, NotificationConsent, PhoneCallRecord, ClientAnalytics } from '@mealline/core';
import { BaseApiService } from '../base';

export type { FoodItem, VoiceIntake, ShoppingListItem };
export type { PhoneClient,ClientProfile,NotificationConsent,PhoneCallRecord,ClientAnalytics };
export interface ClientRevision {id:number;version:number;actor:string;createdAt:string;profile:ClientProfile;consent:NotificationConsent}
export interface ClientChange {id:string;clientId:string|null;intakeId:string|null;kind:string;status:string;reason:string;patch:ClientProfile;decisionNotes:string|null;createdAt:string;client?:PhoneClient|null;intake?:VoiceIntake|null}
export interface ClientDetail extends PhoneClient {revisions:ClientRevision[];intakes:IntakeDetail[];calls:StoredPhoneCall[];changes:ClientChange[]}
export interface StoredPhoneCall extends PhoneCallRecord {createdAt:string;updatedAt:string;expiresAt:string}
export interface PhoneJobSummary {id:string;session_id:string|null;kind:'sync'|'notification'|'verify_callback';status:string;attempts:number;due_at:string;last_error:string|null;created_at:string;updated_at:string}
export interface Basket extends ShoppingList {
  currentForIntake?:boolean;
  updatedAt: string;
  intake?: { caseNumber: string; language: string } | null;
}
export interface Volunteer { id: string; name: string; email: string; role: string }
export interface DeliveryTask extends Delivery {
  basket: Basket | null;
  intake: VoiceIntake | null;
  volunteer: Volunteer | null;
}
export interface IntakeDetail extends VoiceIntake { baskets: Basket[]; deliveries: DeliveryTask[] }
export interface NourishSummary { intakes: number; pendingIntakes: number; inventory: number; stockUnits: number; drafts: number; deliveries: number; pendingDeliveries: number }
export type IntakeSubmission = Partial<Omit<VoiceIntake, 'status' | 'createdAt'>> & { caseNumber: string };

class NourishService extends BaseApiService {
  constructor() { super('/api/nourish'); }
  summary = () => this.get<NourishSummary>('/summary');
  clients = () => this.get<{clients:PhoneClient[]}>('/clients');
  client = (id:string) => this.get<{client:ClientDetail}>(`/clients/${encodeURIComponent(id)}`);
  createClient = (profile:ClientProfile) => this.post<{client:PhoneClient}>('/clients',profile);
  updateClient = (id:string,data:{expectedVersion:number;profile:ClientProfile;consent?:NotificationConsent}) => this.request<{client:PhoneClient}>(`/clients/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(data)});
  mergeClient = (id:string,targetId:string,expectedVersion:number) => this.post<{mergedIntoId:string}>(`/clients/${encodeURIComponent(id)}/merge`,{targetId,expectedVersion});
  phoneCalls = () => this.get<{calls:Array<Pick<StoredPhoneCall,'id'|'clientId'|'caseNumber'|'status'|'summary'|'language'|'createdAt'|'updatedAt'>>}>('/phone-calls');
  phoneCall = (id:string) => this.get<{call:StoredPhoneCall}>(`/phone-calls/${encodeURIComponent(id)}`);
  changes = () => this.get<{changes:ClientChange[]}>('/change-requests');
  reviewChange = (id:string,data:{decision:'approved'|'rejected'|'resolved';notes:string;profile?:ClientProfile;scheduledFor?:string;releaseHold?:boolean}) => this.request<{reviewed:boolean}>(`/change-requests/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(data)});
  phoneSync = () => this.get<{jobs:PhoneJobSummary[]}>('/phone-sync');
  retryPhoneSync = (id:string) => this.post<{queued:boolean}>('/phone-sync/retry',{id});
  rebuildSafetyBasket = (id:string,data:{notes:string;stockReconciled:true}) => this.post<{basketId:number;previousBasketId:number|null}>(`/intakes/${encodeURIComponent(id)}/rebuild-basket`,data);
  clientAnalytics = (range:{preset:string;startDate?:string;endDate?:string}) => this.get<{analytics:ClientAnalytics}>('/client-analytics?'+new URLSearchParams(Object.entries(range).filter((entry):entry is [string,string]=>entry[1]!==undefined)));
  inventory = () => this.get<{ foodItems: FoodItem[] }>('/food-items');
  intakes = () => this.get<{ intakes: VoiceIntake[] }>('/intakes');
  intake = (id: string) => this.get<{ intake: IntakeDetail }>(`/intakes/${encodeURIComponent(id)}`);
  submitIntake = (intake: IntakeSubmission) => this.post<{ intakeId: string; shoppingListId: number; matchedCount: number; items: ShoppingListItem[] }>('/intakes', { intake });
  intakeStatus = (id: string, status: 'pending' | 'matched' | 'cancelled') => this.request<{ intake: VoiceIntake }>(`/intakes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  baskets = () => this.get<{ baskets: Basket[] }>('/baskets');
  updateBasket = (id: number, data: { title?: string; status?: Basket['status']; items?: ShoppingListItem[] }) => this.put<{ basket: Basket }>(`/baskets/${id}`, data);
  deliveries = () => this.get<{ deliveries: DeliveryTask[] }>('/deliveries');
  updateDelivery = (id: string, data: Partial<Pick<Delivery, 'status' | 'assignedTo' | 'scheduledFor' | 'notes'>>) => this.put<{ delivery: DeliveryTask }>(`/deliveries/${encodeURIComponent(id)}`, data);
  volunteers = () => this.get<{ volunteers: Volunteer[] }>('/volunteers');
  addVolunteer = (data: { name: string; email: string }) => this.post<{ volunteer: Volunteer }>('/volunteers', data);
}
export const nourishService = new NourishService();
