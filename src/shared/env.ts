import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

let didLoadEnv = false;

/**
 * Loads .env from common monorepo working directories.
 * Also supports legacy DIRECT_URL by mapping it to DATABASE_URL.
 */
export function ensureEnvLoaded(): void {
  if (!didLoadEnv) {
    const candidates = [
      path.join(process.cwd(), '.env'),
      path.join(process.cwd(), '../../.env'),
      path.join(process.cwd(), '../.env'),
    ];

    for (const envPath of candidates) {
      if (fs.existsSync(envPath)) {
        loadEnv({ path: envPath });
        break;
      }
    }

    didLoadEnv = true;
  }

  if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
    process.env.DATABASE_URL = process.env.DIRECT_URL;
  }
}
