import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { executePhoneCommand, deliveryEvents, phoneFeatureEnabled, purgePhoneTranscripts } from '../services/nourish/clients';
import { maintenanceGuard } from '../services/restore/maintenance-mode';
import { rateLimiter } from '../middleware/rate-limiter';

const router = Router();
router.use((req, res, next) => {
  const expected = process.env.NOURISH_AGENT_API_TOKEN ?? '', supplied = req.get('x-nourish-agent-token') ?? '';
  if (expected.length < 32 || Buffer.byteLength(expected) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return res.status(401).json({ error: 'agent_auth_required' });
  if (!phoneFeatureEnabled()) return res.status(503).json({ error: 'phone_feature_disabled' });
  next();
}, rateLimiter, maintenanceGuard);
router.post('/commands', async (req, res, next) => {
  try { res.json(await executePhoneCommand(req.body)); }
  catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'invalid_phone_command' });
    if (error instanceof Error && 'statusCode' in error) return res.status(Number(error.statusCode)).json({ error: Number(error.statusCode) === 409 ? 'record_conflict' : 'phone_command_rejected' });
    console.error('[phone-api] Command deferred; database unavailable.');
    res.status(503).json({error:'phone_command_unavailable'});
  }
});
router.get('/events', async (req, res, next) => {
  try {
    const after = z.coerce.number().int().min(0).parse(req.query.after ?? 0);
    await purgePhoneTranscripts();
    res.json(await deliveryEvents(after));
  } catch (error) { if (error instanceof z.ZodError) return res.status(400).json({ error: 'invalid_cursor' }); res.status(503).json({error:'phone_events_unavailable'}); }
});
export default router;
