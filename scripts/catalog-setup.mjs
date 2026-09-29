import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const key = () => randomBytes(32).toString('base64url');
try {
  writeFileSync('.env.catalog.local', `# Private local catalog configuration. Never commit this file.\nCATALOG_DEV=1\nCATALOG_ORIGIN=http://127.0.0.1:4173\nCATALOG_SECRET=${key()}\nCATALOG_ADMIN_TELEGRAM_IDS=\n`, { flag: 'wx', mode: 0o600 });
  console.log('Created .env.catalog.local. Moderation uses Telegram topic 6; add admin Telegram IDs to CATALOG_ADMIN_TELEGRAM_IDS for the site admin panel. Secrets are not printed.');
} catch (error) {
  if (error.code === 'EEXIST') console.log('.env.catalog.local already exists and was left unchanged.');
  else throw error;
}
