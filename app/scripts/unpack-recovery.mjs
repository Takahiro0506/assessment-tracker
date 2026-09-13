// Unpack a user's local recovery download without modifying browser or cloud data.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { backup, parseWorkspace } from '../lib/workspace.ts';
const [source, target] = process.argv.slice(2);
if (!source || !target)
  throw Error(
    'Usage: node --experimental-strip-types scripts/unpack-recovery.mjs archive.json NEW_OUTPUT_DIRECTORY',
  );
const archive = JSON.parse(await readFile(source, 'utf8'));
if (archive.format !== 'local-recovery-archive' || !archive.entries)
  throw Error('Not a local recovery archive.');
await mkdir(target, { mode: 0o700 }); // Fails if the destination exists; never overwrites.
let i = 0;
for (const [key, raw] of Object.entries(archive.entries)) {
  const entry = JSON.parse(raw);
  if (entry.data)
    await writeFile(
      path.join(target, `recovered-${++i}.json`),
      backup(parseWorkspace(entry.data)),
      { flag: 'wx', mode: 0o600 },
    );
  else if (key.includes('.draft.'))
    await writeFile(
      path.join(target, `draft-${++i}.json`),
      JSON.stringify(entry, null, 2),
      { flag: 'wx', mode: 0o600 },
    );
  else
    await writeFile(path.join(target, `unparsed-${++i}.txt`), raw, {
      flag: 'wx',
      mode: 0o600,
    });
}
console.log(
  `Extracted ${i} files. Import recovered-*.json through Backup & recovery. Draft files retain the original titles and dates for manual entry.`,
);
