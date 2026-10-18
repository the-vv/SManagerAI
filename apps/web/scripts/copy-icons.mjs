// Copies the Lucide icons the app uses from @taiga-ui/icons into public/assets so the app
// (and the Android build) never needs a CDN at runtime.
import { copyFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const src = join(dirname(require.resolve('@taiga-ui/icons/package.json')), 'src');
const out = new URL('../public/assets/taiga-ui/icons/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const icons = JSON.parse(readFileSync(new URL('./icons.json', import.meta.url), 'utf8'));
let missing = [];
for (const name of icons) {
  const from = join(src, `${name}.svg`);
  if (existsSync(from)) copyFileSync(from, join(out, `${name}.svg`));
  else missing.push(name);
}
if (missing.length) console.warn('Missing icons:', missing.join(', '));
console.log(`Copied ${icons.length - missing.length} icons`);
