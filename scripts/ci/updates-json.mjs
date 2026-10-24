// Appends the new version to updates.json on the gh-pages branch (Firefox self-hosted update manifest,
// referenced by browser_specific_settings.gecko.update_url).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`bad version ${version}`);
const id = 'burbuja@akunito.com';
const repo = process.env.GITHUB_REPOSITORY;
const git = (...a) => execFileSync('git', a, { stdio: 'inherit', cwd: dir });
const dir = mkdtempSync(join(tmpdir(), 'pages-'));
execFileSync('git', ['clone', '--depth', '1', '--branch', 'gh-pages', `https://x-access-token:${process.env.GITHUB_TOKEN ?? ''}@github.com/${repo}.git`, dir], { stdio: 'inherit' });
const file = join(dir, 'updates.json');
const data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { addons: { [id]: { updates: [] } } };
const updates = data.addons[id].updates.filter((u) => u.version !== version);
updates.push({ version, update_link: `https://github.com/${repo}/releases/download/v${version}/burbuja-${version}.xpi` });
data.addons[id].updates = updates;
writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
git('-c', 'user.name=github-actions', '-c', 'user.email=github-actions@users.noreply.github.com', 'commit', '-am', `updates.json: ${version}`);
git('push', 'origin', 'gh-pages');
