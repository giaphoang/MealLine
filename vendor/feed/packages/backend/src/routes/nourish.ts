import { Router, type Request, type Response, type NextFunction } from 'express';
import { timingSafeEqual, randomUUID } from 'crypto';
import { z } from 'zod';
import prisma from '../db';
import * as operations from '../services/nourish';
import { packingPdf } from '../services/nourish/packing-pdf';
import * as clients from '../services/nourish/clients';
import { ANALYTICS_RANGE_PRESETS } from '../services/inventory-analytics/timezone';
import { phoneSyncJobs } from '../services/nourish/phone-sync';

const transcript = z.array(z.object({ step: z.string(), input: z.string().nullable(), reply: z.string(), at: z.string() }));
const text = z.string().max(2000).nullable().optional();
export const intakeSchema = z.object({
  id: z.string().max(128).optional(), caseNumber: z.string().trim().min(1).max(128),
  language: z.enum(['en', 'vi', 'es']).optional(), phone: text,
  addressRaw: text, addressStreet: text, addressCity: text, addressZip: text,
  householdSize: z.number().int().min(1).max(100).nullable().optional(),
  dietaryAvoid: z.array(z.string().max(100)).max(100).optional(), dietaryNotes: text,
  hasStove: z.boolean().nullable().optional(), hasFridge: z.boolean().nullable().optional(),
  availabilityRaw: text, availabilityDays: z.array(z.string()).optional(), availabilityTimes: z.array(z.string()).optional(),
  contactPreference: z.enum(['callback', 'status_link']).nullable().optional(), accommodation: text, transcript: transcript.optional(),
});
const basketSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(), status: z.enum(['draft', 'approved', 'packed', 'delivered']).optional(),
  items: z.array(z.object({ foodItemId: z.number().int().positive(), name: z.string(), quantity: z.number().int().positive(), unit: z.string(), notes: z.string().optional() })).max(100).optional(),
});
const deliverySchema = z.object({
  status: z.enum(['pending', 'assigned', 'in_transit', 'delivered', 'failed']).optional(), assignedTo: z.string().nullable().optional(),
  scheduledFor: z.string().datetime().nullable().optional(), notes: text,
});
const router = Router();
const route = (handler: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try { await handler(req, res); } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: { message: error.issues[0]?.message ?? 'Check the submitted fields.', code: 'INVALID_NOURISH_INPUT' } });
    next(error);
  }
};

export function requireInternalToken(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.NOURISH_INTERNAL_TOKEN;
  const supplied = req.headers['x-nourish-token'];
  if (!expected || typeof supplied !== 'string' || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return res.status(401).json({ error: { message: 'This connection is not authorized.', code: 'INTERNAL_AUTH_REQUIRED' } });
  }
  next();
}

router.get('/summary', route(async (_req, res) => res.json(await operations.summary())));
router.get('/clients', route(async (_req, res) => res.json({ clients: await clients.listClients() })));
router.post('/clients',route(async(req,res)=>res.status(201).json({client:await clients.createClientByStaff(req.body,req.auth?.userId ?? 'staff')})));
router.get('/clients/:id', route(async (req, res) => res.json({ client: await clients.clientDetails(String(req.params.id)) })));
router.patch('/clients/:id', route(async (req, res) => res.json({ client: await clients.updateClientByStaff(String(req.params.id), req.body, req.auth?.userId ?? 'staff') })));
router.post('/clients/:id/merge', route(async (req, res) => {
  const body = z.object({ targetId: z.string().min(1), expectedVersion: z.number().int().positive() }).strict().parse(req.body);
  res.json(await clients.mergeClients(String(req.params.id), body.targetId, body.expectedVersion, req.auth?.userId ?? 'staff'));
}));
router.get('/client-analytics', route(async (req, res) => {
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const parsed = new Date(value + 'T00:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Provide a valid calendar date.').optional();
  const body = z.object({ preset: z.enum(ANALYTICS_RANGE_PRESETS).default('last-90-days'), startDate: date, endDate: date }).superRefine((value, ctx) => {
    if (value.preset === 'custom' && (!value.startDate || !value.endDate || value.startDate > value.endDate))
      ctx.addIssue({ code: 'custom', message: 'Choose both dates, with the start on or before the end.' });
  }).parse(req.query);
  res.json({ analytics: await clients.clientAnalytics(body) });
}));
router.get('/phone-calls', route(async (_req, res) => res.json({ calls: await clients.listCalls() })));
router.get('/phone-calls/:id',route(async(req,res)=>res.json({call:await clients.callDetails(String(req.params.id))})));
router.get('/phone-sync',route(async(_req,res)=>res.json(await phoneSyncJobs())));
router.post('/phone-sync/retry',route(async(req,res)=>{
  const {id}=z.object({id:z.string().min(1).max(160)}).strict().parse(req.body);
  res.json(await phoneSyncJobs(id));
}));
router.get('/change-requests', route(async (_req, res) => res.json({ changes: await clients.listChanges() })));
router.patch('/change-requests/:id', route(async (req, res) => res.json(await clients.reviewChange(String(req.params.id), req.body, req.auth?.userId ?? 'staff'))));
router.post('/intakes/:id/rebuild-basket',route(async(req,res)=>res.json(await clients.rebuildSafetyBasket(String(req.params.id),req.body,req.auth?.userId ?? 'staff'))));
router.get('/food-items', route(async (_req, res) => res.json({ foodItems: await operations.getInventory() })));
router.post('/food-items', route(async (req, res) => res.status(201).json(await operations.createLegacyFoodItem(req.body))));
router.get('/intakes', route(async (_req, res) => res.json({ intakes: await operations.getIntakes() })));
router.get('/intakes/:id', route(async (req, res) => res.json({ intake: await operations.getIntake(String(req.params.id)) })));
router.post('/intakes', route(async (req, res) => {
  const body = z.object({ intake: intakeSchema, transcript: transcript.optional() }).parse(req.body);
  res.status(201).json(await operations.submitIntake(body.intake, body.transcript));
}));
router.patch('/intakes/:id', route(async (req, res) => {
  const { status } = z.object({ status: z.enum(['pending', 'matched', 'cancelled']) }).parse(req.body);
  const current = await operations.getIntake(String(req.params.id));
  if (['assigned', 'delivered'].includes(current.status)) throw operations.operationError('Use the delivery workflow to update an assigned intake.');
  res.json({ intake: await prisma.nourishIntake.update({ where: { id: current.id }, data: { status } }) });
}));
router.get('/baskets', route(async (_req, res) => res.json({ baskets: await operations.getBaskets() })));
router.get('/baskets/:id/pdf', route(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="nourish-basket-${id}.pdf"`);
  res.send(await packingPdf(id));
}));
router.put('/baskets/:id', route(async (req, res) => res.json({ basket: await operations.updateBasket(z.coerce.number().int().positive().parse(req.params.id), basketSchema.parse(req.body)) })));
router.get('/deliveries', route(async (_req, res) => res.json({ deliveries: await operations.getDeliveries() })));
router.put('/deliveries/:id', route(async (req, res) => res.json({ delivery: await operations.updateDelivery(String(req.params.id), deliverySchema.parse(req.body)) })));
router.get('/volunteers', route(async (_req, res) => res.json({ volunteers: await prisma.nourishVolunteer.findMany({ select: { id: true, name: true, email: true, role: true }, orderBy: { name: 'asc' } }) })));
router.post('/volunteers', route(async (req, res) => {
  const input = z.object({ name: z.string().trim().min(1).max(128), email: z.string().email(), role: z.enum(['admin', 'coordinator', 'volunteer']).default('volunteer') }).parse(req.body);
  res.status(201).json({ volunteer: await prisma.nourishVolunteer.create({ data: { ...input, id: `volunteer_${randomUUID()}` }, select: { id: true, name: true, email: true, role: true } }) });
}));
export default router;
