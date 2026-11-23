// Runs every end-to-end suite in order and stops with a non-zero code if any fails.
const { execFileSync } = require('child_process');
const path = require('path');
let failed = 0;
for (const s of ['basico', 'integ', 'bills', 'novos']) {
  try { execFileSync(process.execPath, [path.join(__dirname, s + '.cjs')], { stdio: 'inherit' }); }
  catch { failed++; }
}
process.exit(failed ? 1 : 0);
