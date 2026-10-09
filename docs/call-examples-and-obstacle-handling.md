# MealLine: Successful Calls and Obstacle Handling

MealLine connects a guided phone conversation with household requests, proposed shopping baskets, pantry inventory, volunteer assignments, and delivery tracking. This guide describes the implemented prototype for callers, pantry staff, judges, and potential collaborators.

The examples use fictional details and shortened prompts. They assume the optional client phone workflow is enabled, the required services are configured, and the dedicated phone worker is running. They illustrate the intended workflow rather than documenting a real completed phone call. See [Client phone interface](client-phone-interface.md) for configuration and activation details.

## Successful sample: a new household requests food

### Conversation

**MealLine:** Hello, this is MealLine, a food assistance service. Please say your language.  
**Caller:** English.

**MealLine:** I'm an automated assistant. We save your answers for MealLine staff, without recording this call. Is that okay?  
**Caller:** Yes.

**MealLine:** Press 1 for a food request, 2 for delivery status, 3 to update your information, 4 to change a delivery, 5 to report a missed delivery, or 0 for a person.  
**Caller:** *Presses 1.*

**MealLine:** Have you registered with us before? Press 1 for yes, or 2 for no.  
**Caller:** *Presses 2.*

**MealLine:** What name should we use for your household contact?  
**Caller:** Alex.

**MealLine:** What is your delivery address, including city and ZIP code?  
**Caller:** 123 Test Street, Des Moines, 50309.

**MealLine:** How many people live in your household?  
**Caller:** Four.

**MealLine:** Does anyone have food allergies or foods they avoid?  
**Caller:** We avoid dairy.

**MealLine:** Do you have a working stove and refrigerator? Press 1 for both, 2 for stove only, 3 for refrigerator only, or 4 for neither.  
**Caller:** *Presses 3.*

**MealLine:** Which days and times are usually good for a delivery?  
**Caller:** Weekday mornings.

**MealLine:** How should we contact you?  
**Caller:** Call me at 515-555-0142.

**MealLine:** Do you need any accommodation or delivery instructions?  
**Caller:** Please leave the groceries at the door.

**MealLine:** To verify your phone, press 1 for a text message or 2 for a voice callback.  
**Caller:** *Presses 1.*

**MealLine:** Please enter your six-digit code.  
**Caller:** *Enters the code received by text.*

**MealLine:** May we send automatic updates? Press 1 for texts, 2 for callback reminders, or 3 for none.  
**Caller:** *Presses 1.*

**MealLine:** Contact name: Alex. Address: 123 Test Street, Des Moines, 50309. Household size: four. Avoid dairy. Refrigerator available; no stove. Available weekday mornings. Contact phone: 515-555-0142. Leave groceries at the door. Is all of that correct?  
**Caller:** Yes.

**MealLine:** Keep your household reference: [generated ten-digit reference]. Your request [case number] is saved for MealLine staff review. It is not a confirmed delivery.

The caller can ask for repetition, correct an answer, or request a person during the conversation. Verification codes are excluded from saved conversation text and model extraction.

### What happens in the pantry system

1. **Confirmation:** MealLine creates a case for staff review and saves the confirmed command in its durable synchronization queue.
2. **Synchronization:** The background worker sends the command to the pantry backend. Staff can see the household profile, request, retained call text, and draft household basket.
3. **Matching:** The basket uses currently available food, dietary exclusions, and kitchen requirements. In this example, foods marked as requiring a stove are excluded. The current quantity rule is `max(1, ceil(householdSize / 2))`, capped by each item's recorded stock, with a default maximum of 20 matched items.
4. **Review and approval:** Staff review household notes, food labels, quantities, and availability. Approval creates a delivery task.
5. **Packing:** Marking the basket packed rechecks stock and deducts the exact quantities in one transaction. Repeating the same packed-state action preserves the original deduction.
6. **Assignment and scheduling:** Staff choose a volunteer from the roster and record a delivery time. Packing and assignment must both be completed before transit.
7. **Delivery completion:** Staff advance the delivery through transit to delivered. The linked intake and basket are updated, and client analytics count the recorded completion.

For example, if the proposed basket includes two cans of beans and the pantry holds ten, marking the basket packed reduces the stock to eight. The call creates the request and proposed basket; the packing action triggers the stock deduction.

## Other successful caller actions

| Scenario | Caller interaction | Successful result |
| --- | --- | --- |
| Check delivery status | Choose option 2, provide the registered number and any required household reference, and complete verification. | Hear the current request status from pantry records, such as awaiting staff review, scheduled, out for delivery, or delivered. |
| Update household information | Choose option 3, verify access, select a field, provide the correction, and confirm the readback. | Queue the confirmed change. Synchronization updates the versioned profile, or creates a staff follow-up if a newer edit conflicts. |
| Change dietary or kitchen needs | Use the profile-update flow to change food avoidances or equipment access. | Update the profile and place active requests on a safety review hold for staff to reassess their baskets. |
| Request a delivery change | Choose option 4, verify access, select the relevant request, explain the change, and confirm. | Create a staff-review task for rescheduling or cancellation. |
| Report a missed delivery | Choose option 5, verify access, identify the request, describe the problem, and confirm. | Create a visible follow-up for the pantry team. Staff decide the appropriate resolution. |
| Resume an interrupted request | A verified returning household chooses its original operation and accepts the offer to resume an eligible saved draft. | Continue the supported unfinished workflow while preserving its original profile version for conflict checks. |

Status reads reflect the pantry's current records. A successful profile or delivery-change call means the confirmed action is saved for processing; staff review remains part of any affected delivery workflow.

## Obstacles and handling

| Obstacle | Automatic handling | Staff involvement or boundary |
| --- | --- | --- |
| Difficulty using technology or complex forms | Ordinary phone access, one question at a time, keypad choices, repeat requests, and an accessible text alternative. | A person can assist callers who cannot complete the supported interfaces. |
| Unclear answers, silence, or incorrect information | Repeat or clarify the question, allow corrections, and read details back before explicit confirmation. Repeated failed input triggers handoff. | Staff resolve information that remains uncertain. |
| Language barriers | Authored English, Spanish, and Vietnamese prompts. English and Spanish can use Pipecat streaming; Vietnamese follows the existing TwiML path. | Other language needs require human assistance. Spanish and Vietnamese wording and real speech quality need validation. |
| Streaming speech or model extraction fails | Streaming can return to the standard telephone prompts. Model extraction falls back to deterministic interpretation, including fixed questions and keypad controls. | Persistent communication problems become human follow-up. |
| Caller disconnects before confirmation | Preserve the partial draft. Verified returning households can resume supported unfinished workflows. | Anonymous or unverified drafts remain available to staff; access to private drafts requires verification. |
| Caller has a landline or cannot receive a text code | Offer a voice verification callback after the parent call has ended. The caller then calls back to continue. | The callback requires a configured verification service and worker. Lost-phone access requires staff assistance. |
| Shared phone numbers or failed verification | Require a household reference when needed. Limit code attempts, apply cooldowns, and keep codes out of model input and transcripts. | Repeated failures route to a person. A new food request can still be saved for review when the verification provider is unavailable. |
| Pantry API is temporarily unavailable or rate-limits requests | Keep saved commands in the durable queue and retry eligible synchronization failures with bounded backoff. | Exhausted retries, authorization failures, and rejected commands remain visible for review. |
| Duplicate webhooks or retried commands | Reuse call sessions where applicable and deduplicate immutable command IDs using saved receipts. Preserve previously approved or packed baskets. | Separate, intentionally submitted food requests remain distinct records. |
| Another caller or staff member changes the same profile | Check the expected profile version before applying a confirmed update. | Conflicting changes become review tasks; staff reconcile the latest information. |
| Insufficient stock or unsuitable food | Filter the proposed basket and recheck suitability and quantities during approval and packing. Empty baskets cannot be approved. | Staff review labels, revise the basket, or arrange follow-up when appropriate food is unavailable. |
| Dietary or kitchen requirements change after basket preparation | Place active requests on a safety hold that blocks dispatch. | Staff review requirements and, if necessary, reconcile physical stock and create a new basket draft. Packed stock is not automatically refunded. |
| No volunteer has been assigned | Prevent advancement to assigned, in-transit, or delivered states without a valid volunteer assignment. | Staff find an available volunteer and coordinate delivery. |
| Caller requests a cancellation, schedule change, or reports a missed delivery | Save the confirmed request as a staff follow-up. | Staff authorize the change. In-transit or completed deliveries require coordination with the delivery team. |
| Notification fails or its sending outcome is uncertain | Keep failed work visible, check current consent and phone verification, and suppress superseded updates. Generic callback reminders omit personal details. | Uncertain external sends require manual review. Provider acceptance is tracked separately from recipient acknowledgement. |

## What finishing means

The phone conversation is complete when the caller explicitly confirms the information and MealLine saves the request or action for processing.

The food-assistance workflow is complete when a delivery is explicitly recorded as delivered after the required review, packing, volunteer assignment, and transit steps. That completion updates the linked intake and basket and contributes to completed-delivery and served-household analytics.

MealLine depends on available food, volunteers, working services, and staff follow-through. Its current automation supports intake, proposed baskets, synchronization, inventory deduction at packing, and delivery tracking. Staff voice commands for direct inventory updates are a future development goal.

## Current verification limits

- The optional client phone workflow is disabled by default. These examples require its explicit activation and the dedicated phone worker.
- Automated tests cover simulated calling, verification, synchronization, fulfillment, and recovery scenarios. A scripted example is not evidence of a successful call over the real telephone network.
- Live call quality, staffed transfer, Spanish/Vietnamese wording, and accessibility with real users require acceptance testing before a public pilot.
- Matching uses food-name and dietary/equipment flags. Staff must review labels and household notes before approval.

## Related documentation and implementation

- [Client phone interface](client-phone-interface.md): caller and staff workflows, configuration, activation, retention, and recovery.
- [Pipecat adapter guide](../mealline/docs/pipecat.md): streaming voice, fallback, and service boundaries.
- [Phone prompts](../mealline/lib/phonePrompts.ts) and [intake questions](../mealline/lib/i18n.ts): authored caller-facing wording.
- [Phone workflow](../mealline/lib/phoneFlow.ts) and [phone worker](../mealline/lib/phoneJobs.ts): confirmation, verification, draft recovery, synchronization, and notifications.
- [Shared matcher](../packages/core/src/matcher.ts): food suitability and household quantities.
- [Pantry fulfillment](../vendor/feed/packages/backend/src/services/nourish/index.ts) and [client operations](../vendor/feed/packages/backend/src/services/nourish/clients.ts): baskets, stock, delivery states, profile changes, and safety holds.
- [Caller workflow tests](../mealline/tests/client-phone.test.ts): simulated successful calls and recovery scenarios.
