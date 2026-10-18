const { execSync } = require('child_process');
const { mkdirSync, rmSync } = require('fs');
const { join } = require('path');

/** Fresh migrated SQLite file for the whole test run (migrations are exercised too). */
module.exports = async function globalSetup() {
  const dir = join(__dirname, '.tmp');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const url = `file:${join(dir, 'test.db')}`;
  process.env.DATABASE_URL = url;
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
};
