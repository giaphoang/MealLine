export interface FoodItem {
  id: number;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  isInStock: boolean;
  vegan: boolean;
  vegetarian: boolean;
  glutenFree: boolean;
  halal: boolean;
  kosher: boolean;
  requiresStove: boolean;
  requiresFridge: boolean;
}

export interface VoiceIntake {
  clientId?: string | null;
  reviewHold?: boolean;
  id: string;
  caseNumber: string;
  language: "en" | "vi" | "es";
  phone: string | null;
  addressRaw: string | null;
  addressStreet?: string | null;
  addressCity?: string | null;
  addressZip?: string | null;
  householdSize: number | null;
  dietaryAvoid: string[];
  dietaryNotes: string | null;
  hasStove: boolean | null;
  hasFridge: boolean | null;
  availabilityRaw: string | null;
  availabilityDays?: string[];
  availabilityTimes?: string[];
  contactPreference: "callback" | "status_link" | null;
  accommodation: string | null;
  status: "pending" | "matched" | "assigned" | "delivered" | "cancelled";
  transcript: Array<{ step: string; input: string | null; reply: string; at: string }>;
  createdAt: string;
}

export interface ShoppingListItem {
  foodItemId: number;
  name: string;
  quantity: number;
  unit: string;
  notes?: string;
}

export interface ShoppingList {
  id: number;
  intakeId: string | null;
  title: string;
  status: "draft" | "approved" | "packed" | "delivered";
  items: ShoppingListItem[];
  createdAt: string;
}

export interface Delivery {
  id: string;
  shoppingListId: number | null;
  intakeId: string | null;
  assignedTo: string | null;
  assigneeName?: string;
  status: "pending" | "assigned" | "in_transit" | "delivered" | "failed";
  scheduledFor: string | null;
  notes: string | null;
}
