/* Prepares a release. It does NOT publish and it does NOT tag: pushing a tag
   is the deliberate act that puts something online, and it stays a human's.

   What it does is the part nobody can do reliably by hand. Bumping the client
   touches ten files, the built bundle, the copy the website serves under a
   versioned name, and five SRI digests written out in prose. Miss one digest
   and the tool stops loading -- for everyone, with no message anywhere. That
   is not a mistake to leave to attention.

       node tools/release.mjs client 2.0.1
       node tools/release.mjs mcp 2.1.0
*/

import { readFileSync, writeFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const [pkg, version] = process.argv.slice(2);

if (!['client', 'mcp'].includes(pkg) || !/^\d+\.\d+\.\d+$/.test(version || '')) {
    console.error('usage: node tools/release.mjs <client|mcp> <x.y.z>');
    process.exit(1);
}

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' });
const files = run('git', ['ls-files']).split('\n').filter(Boolean);

/* Refuse on a dirty tree. Half of this rewrites files in place; a failure
   halfway through must be recoverable with one git checkout, which it is not
   if there was already work in there. */
if (run('git', ['status', '--porcelain']).trim()) {
    console.error('the working tree is not clean. Commit or stash first:');
    console.error(run('git', ['status', '--short']));
    process.exit(1);
}

const manifestPath = `${pkg}/package.json`;
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const previous = manifest.version;

if (previous === version) {
    console.error(`${manifestPath} already declares ${version}. Nothing to do.`);
    process.exit(1);
}

manifest.version = version;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`  ${manifestPath}  ${previous} -> ${version}`);

if (pkg === 'client') {
    /* The bundle carries the version, so it must be rebuilt BEFORE anything
       computes a digest from it. */
    run('node', ['client/tools/build.mjs']);
    const bundle = readFileSync('client/dist/annotepage.js');
    const digest = 'sha384-' + createHash('sha384').update(bundle).digest('base64');
    console.log(`  rebuilt  ${bundle.length} bytes  ${digest.slice(0, 22)}...`);

    /* The website serves the client itself, under a name carrying the version.
       The name has to change: the old URL is cached for ten minutes and may sit
       in somebody's page for months, and both must keep working. */
    const older = `docs/annotepage-client-${previous}.js`;
    const newer = `docs/annotepage-client-${version}.js`;
    copyFileSync('client/dist/annotepage.js', newer);
    console.log(`  ${newer}`);
    if (existsSync(older)) {
        /* Removed on purpose: a page still pointing at the old URL carries the
           OLD digest, so it would break on a file that no longer matches it
           anyway. Leaving it would only delay the failure and hide its cause. */
        rmSync(older);
        console.log(`  removed  ${older}`);
    }

    /* Every written digest, and every URL naming the version. Prose included:
       these are the lines people copy. */
    const oldDigest = readFileSync('client/dist/HASHES.txt', 'utf8')
        .match(/sha384-[A-Za-z0-9+/=]+/)?.[0];
    let touched = 0;
    for (const file of [...files, newer]) {
        if (!/\.(md|html|txt|json|mjs|js)$/.test(file)) continue;
        if (file.startsWith('client/dist/') || file === newer) continue;
        let text;
        try { text = readFileSync(file, 'utf8'); } catch { continue; }
        const before = text;
        text = text.replace(/sha384-[A-Za-z0-9+/=]+/g, digest);
        text = text.split(`annotepage-client-${previous}.js`)
                   .join(`annotepage-client-${version}.js`);
        text = text.split(`annotepage-client@${previous}`)
                   .join(`annotepage-client@${version}`);
        if (text !== before) { writeFileSync(file, text); touched++; console.log(`  ${file}`); }
    }
    console.log(`  ${touched} file(s) carried the digest or the version`);
    if (oldDigest === digest) {
        console.log('  note: the bundle is byte-identical to the previous version.');
    }
}

console.log('\nNow, and only if the checks pass:\n');
console.log('  npm run check');
console.log(`  git commit -am "Release ${pkg} ${version}"`);
console.log(`  git tag ${pkg}-v${version} && git push origin main ${pkg}-v${version}`);
console.log('\nThe tag is what publishes. Nothing here has done so.');
