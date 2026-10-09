import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { timingSafeEqual } from 'crypto';
import { existsSync } from 'fs';
import path from 'path';
import createFeedServer from './server';
import nourishRouter from './routes/nourish';
import nourishAgentRouter from './routes/nourish-agent';
import { authMiddleware, jwtAuthMiddleware } from './middleware/auth';
import { maintenanceGuard } from './services/restore/maintenance-mode';
import { errorHandler } from './middleware/error-handler';
import { purgePhoneTranscripts } from './services/nourish/clients';

// Keep the complete upstream FEED application mounted under /feed. The root
// aliases retain MealLine's URLs without a second frontend or database.
export function createNourishServer() {
  const app = express();
  app.disable('x-powered-by');
  const purge=()=>purgePhoneTranscripts().catch(()=>console.warn('[phone-retention] Deferred; database unavailable.'));
  void purge();setInterval(purge,3600000).unref();
  app.get('/source', (_req, res) => {
    const archive = process.env.NOURISH_SOURCE_ARCHIVE || path.resolve(__dirname, '../../../../../.nourish/source/mealline-source.tar.gz');
    if (!existsSync(archive)) return res.status(503).json({ error: { message: 'The source archive has not been built. Run npm run build.', code: 'SOURCE_NOT_PACKAGED' } });
    // The configured archive is inside the private .nourish directory. Allow
    // this one explicit file; send's default would hide it with a 404.
    res.download(archive, 'mealline-source.tar.gz', { dotfiles: 'allow' });
  });
  app.get('/health', (_req, res) => res.json({ status: 'ok', application: 'mealline' }));
  app.use('/api/voice-agent', express.json({ limit: '1mb' }), nourishAgentRouter);
  app.use('/feed', createFeedServer());
  for (const [from, to] of Object.entries({ '/': '/feed/', '/clients': '/feed/clients', '/inventory': '/feed/food-items', '/intakes': '/feed/intakes', '/shopping-lists': '/feed/household-baskets', '/deliveries': '/feed/deliveries', '/login': '/feed/login' })) {
    app.get(from, (_req, res) => res.redirect(302, to));
  }
  for (const prefix of ['brand', 'fonts', 'downloads', 'help-screenshots']) {
    app.use(`/${prefix}`, (req, res) => res.redirect(307, `/feed/${prefix}${req.url}`));
  }

  const legacy = express.Router();
  legacy.use(express.json(), cookieParser(), jwtAuthMiddleware);
  const authorizeVoice = (req: Request, res: Response, next: NextFunction) => {
    const expected = process.env.NOURISH_VOICE_API_TOKEN;
    const supplied = req.get('x-nourish-voice-token');
    if (req.method === 'POST' && expected && supplied && Buffer.byteLength(supplied) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return next();
    return authMiddleware(req, res, next);
  };
  const dispatch = (prefix: string) => (req: Request, res: Response, next: NextFunction) => {
    const originalUrl = req.url;
    req.url = `${prefix}${originalUrl === '/' ? '' : originalUrl}`;
    // Dispatch in the same mounted layer: a second Express use() would strip
    // the just-rewritten prefix again, leaving the child router with '/'.
    nourishRouter(req, res, (error?: unknown) => {
      req.url = originalUrl;
      next(error);
    });
  };
  legacy.use('/voice-intakes', authorizeVoice, maintenanceGuard, dispatch('/intakes'));
  legacy.use('/food-items', authMiddleware, maintenanceGuard, dispatch('/food-items'));
  app.use('/api', legacy);
  app.use(errorHandler);
  return app;
}
