import assert from 'node:assert/strict';
import fs from 'node:fs';

const packageJsonUrl = new URL('../package.json', import.meta.url);
const packageJson = JSON.parse(fs.readFileSync(packageJsonUrl, 'utf8'));

assert.equal(
  packageJson.type,
  'module',
  'Vercel must load api/chat.js as an ES module serverless function'
);

assert.equal(packageJson.private, true, 'demo package should not be publishable by accident');

console.log('deployment config tests passed');
