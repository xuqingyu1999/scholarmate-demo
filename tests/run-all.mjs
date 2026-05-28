import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const testsDir = dirname(fileURLToPath(import.meta.url));
const testFiles = readdirSync(testsDir)
  .filter(name => name.endsWith('.test.mjs'))
  .sort();

for (const name of testFiles) {
  console.log(`Running ${name}`);
  const result = spawnSync(process.execPath, [join(testsDir, name)], {
    cwd: join(testsDir, '..'),
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
