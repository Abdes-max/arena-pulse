// Prisma's seed runner splits the `migrations.seed` command on spaces without
// a shell, so "&&" isn't interpreted as a chain operator — it silently drops
// everything after the first command instead of erroring. This wrapper does
// the two steps (build, then run the compiled seed) itself via execSync,
// which does use a real shell.
const { execSync } = require('node:child_process');
const path = require('node:path');

const apiRoot = path.join(__dirname, '..');

execSync('npm run build', { cwd: apiRoot, stdio: 'inherit' });
execSync('node dist/prisma/seed.js', { cwd: apiRoot, stdio: 'inherit' });
