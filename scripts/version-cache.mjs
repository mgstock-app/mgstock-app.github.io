import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Every production build gets a new cache. GitHub run IDs make deployment
// versions traceable; local builds use a timestamp. No other app's caches match.
const version = process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`
  : new Date().toISOString().replace(/[^0-9]/g, '');
const digest = createHash('sha256').update(version).digest('hex').slice(0, 16);
const template = readFileSync(new URL('./sw-template.js', import.meta.url), 'utf8');
writeFileSync(new URL('../public/sw.js', import.meta.url), template.replace('__BUILD_VERSION__', digest));
console.log(`mgstock cache: ${digest}`);
