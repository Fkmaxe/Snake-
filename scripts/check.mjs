import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = path.join(root, 'dist');
let count = 0;
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await check(filename);
    else if (filename.endsWith('.js') || filename.endsWith('.mjs')) {
      execFileSync(process.execPath, ['--check', filename]);
      const content = await readFile(filename, 'utf8');
      for (const match of content.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) await readFile(path.resolve(directory, match[1]));
      count++;
    }
  }
}
await check(source); await check(path.join(root, 'scripts'));
console.log(`${count} modules : syntaxe et imports vérifiés.`);
