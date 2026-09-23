// Lists public/prints/*.png so the Trial Room knows which artwork exists without touching the disk at runtime
// (on serverless hosts public/ is served from the CDN, not the function's filesystem). Runs before every build.
import { readdirSync, writeFileSync } from 'node:fs';
const names = readdirSync(new URL('../public/prints', import.meta.url)).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)).sort();
writeFileSync(new URL('../data/prints.json', import.meta.url), JSON.stringify(names, null, 1) + '\n');
console.log(`prints manifest: ${names.length} files`);
