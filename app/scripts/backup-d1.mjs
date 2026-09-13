import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
// Remote exports are read-only, but require a deliberately supplied production config.
const [
  mode = '--local',
  config = 'wrangler.local.json',
  directory = '.local-backups',
] = process.argv.slice(2);
if (!['--local', '--remote'].includes(mode))
  throw Error(
    'Use --local or --remote, followed by config and backup directory.',
  );
if (mode === '--remote' && config === 'wrangler.local.json')
  throw Error(
    'Supply the verified production configuration for a remote backup.',
  );
await mkdir(directory, { recursive: true, mode: 0o700 });
const file = path.resolve(
  directory,
  `d1-${new Date().toISOString().replaceAll(':', '-')}.sql`,
);
const result = spawnSync(
  process.execPath,
  [
    'node_modules/wrangler/bin/wrangler.js',
    'd1',
    'export',
    'DB',
    mode,
    '--config',
    config,
    '--output',
    file,
  ],
  { stdio: 'inherit' },
);
if (result.status !== 0)
  throw Error('Export failed. No successful backup is recorded.');
const bytes = await readFile(file);
const sha256 = createHash('sha256').update(bytes).digest('hex');
await writeFile(
  file + '.manifest.json',
  JSON.stringify(
    {
      file: path.basename(file),
      bytes: bytes.length,
      sha256,
      createdAt: new Date().toISOString(),
      mode,
    },
    null,
    2,
  ),
  { flag: 'wx', mode: 0o600 },
);
console.log(
  `Backup verified: ${file} (${bytes.length} bytes). Copy this directory to separate secure storage.`,
);
