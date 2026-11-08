/**
 * run.js — runs the validation suite against the current dist/.
 *
 *   node tests/run.js            every tests/test-*.js
 *   node tests/run.js links urls only test-links.js and test-urls.js
 *
 * `npm test` builds first, then runs this. Each check runs in its own process
 * and every check runs even after a failure; the exit code is 1 if any failed.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const all = fs.readdirSync(__dirname)
  .filter((f) => /^test-.+\.js$/.test(f))
  .map((f) => f.slice('test-'.length, -'.js'.length))
  .sort();
const wanted = process.argv.slice(2);
const unknown = wanted.filter((n) => !all.includes(n));
if (unknown.length) {
  console.error(`Unknown test(s): ${unknown.join(', ')}. Available: ${all.join(', ')}`);
  process.exit(1);
}

let failed = 0;
for (const name of wanted.length ? wanted : all) {
  const { status } = spawnSync(process.execPath, [path.join(__dirname, `test-${name}.js`)], { stdio: 'inherit' });
  if (status !== 0) {
    failed++;
    console.error(`  [31m✗ FAILED[0m  test-${name}.js exited with status ${status}`);
  }
}
if (failed) process.exit(1);
