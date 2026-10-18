// Consistent online backup of the SQLite database (safe while the API is running, WAL included).
// Usage: node scripts/backup.mjs [destinationFile]
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const url = process.env.DATABASE_URL ?? 'file:./dev.db';
const source = url.replace(/^file:/, '');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = process.argv[2] ?? `/backups/smanager-${stamp}.db`;

mkdirSync(dirname(dest), { recursive: true });
const db = new Database(source, { readonly: true, fileMustExist: true });
try {
  await db.backup(dest); // uses SQLite's online backup API: a single, self-contained, restorable file
} finally {
  db.close();
}
// Make the copy a single self-contained file (no -wal/-shm sidecars), then verify it.
const check = new Database(dest);
check.pragma('journal_mode = DELETE');
const result = check.pragma('integrity_check', { simple: true });
check.close();
if (result !== 'ok') {
  console.error(`Backup written to ${dest} but integrity_check reported: ${result}`);
  process.exit(1);
}
console.log(`Backup OK: ${dest}`);
