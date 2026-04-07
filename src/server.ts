import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

/** Load monorepo root `.env` whether the process cwd is `denpro-web` or `packages/api`. */
function loadRootEnv(): void {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '../../.env'),
    path.join(process.cwd(), '../.env'),
  ];
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      loadEnv({ path: envPath });
      return;
    }
  }
}
loadRootEnv();
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './routers';
import { createContext } from './trpc';
import { initializeBackupScheduler } from './services/backup';
import calendarFeedRouter from './routes/calendarFeed';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());

// Apply generalized rate limiting to the tRPC endpoint
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 10000,
  standardHeaders: true, 
  legacyHeaders: false, 
  message: { error: { message: 'Too many requests, please try again later.' } }
});

app.use('/trpc', apiLimiter);

// Note: Do NOT use express.json() before tRPC — tRPC v11 handles its own body parsing
app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// express.json() only for non-tRPC routes
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Calendar feed routes (plain HTTP GET for calendar app subscription)
app.use(calendarFeedRouter);

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  
  // Initialize daily DB backups at 2 AM
  initializeBackupScheduler('0 2 * * *');
});
