/* Writes server/webroot/MANIFEST: one line per shipped server file, its
   SHA-256 and its path.

       node tools/build-server-manifest.mjs            rewrites it
       node tools/build-server-manifest.mjs --check    fails if it is stale

   WHY A PER-FILE HASH AND NOT AN ARCHIVE. The updater runs on shared PHP
   hosting, where the zip and phar extensions are commonly absent -- a release
   shipped as an archive would be unopenable on exactly the machines this
   feature exists for. With one hash per file there is nothing to extract: the
   updater downloads the files it needs and checks each one on arrival. The
   per-file hash IS the integrity check, so this file is not a convenience, it
   is the thing being trusted.

   THE FORMAT IS sha256sum's, deliberately. `cd server/webroot && sha256sum -c
   MANIFEST` verifies an installation with a command every host already has,
   with nothing of ours involved. That is worth more than a prettier format,
   and it is why there is no header line and no comment in there: GNU sha256sum
   rejects both.

   Sorted by path, LF endings, ASCII only: two builds of the same tree must
   produce the same bytes, otherwise "the manifest changed" stops meaning
   anything. */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = 'server/webroot';
const MANIFEST = `${ROOT}/MANIFEST`;

/* What is NOT in the manifest, and why each one is left out:

   MANIFEST          cannot contain its own hash.
   config-local.php  is never shipped -- it holds the projects, the origins and
                     the paths to the credentials, and it is dropped in per
                     server. The updater must never touch it, and the surest
                     way to guarantee that is for it to be unable to name it.
   install.php       the updater downloads every listed file whose hash differs
                     from the one on disk, and a file that is ABSENT differs.
                     Listing the installer would therefore RESURRECT it on
                     every server whose operator had deleted it -- putting a
                     writable, reachable installer back on a live site, which
                     is the exact thing install.php's own last screen tells
                     them to prevent. It ships in the release directory; it is
                     not part of what the updater maintains.
   .update/          the updater's own staging, backup and state directory. It
                     appears only on a server that has run an update.  */
const SKIP_FILES = new Set(['MANIFEST', 'config-local.php', 'install.php']);

/* Directories whose name starts with a dot are skipped; FILES whose name
   starts with a dot are not. `.htaccess` is shipped and its absence would be
   silent -- a directory listing served instead of a 403 shows nothing until
   someone goes looking. */
const walk = (dir, prefix = '') => {
    const out = [];
    for (const name of readdirSync(dir).sort()) {
        const full = `${dir}/${name}`;
        const relative = prefix ? `${prefix}/${name}` : name;
        if (statSync(full).isDirectory()) {
            if (name.startsWith('.')) continue;
            out.push(...walk(full, relative));
            continue;
        }
        if (SKIP_FILES.has(name)) continue;
        out.push(relative);
    }
    return out;
};

if (!existsSync(ROOT)) {
    console.error(`missing ${ROOT} -- run this from the root of the repository`);
    process.exit(1);
}

const paths = walk(ROOT).sort();
const lines = paths.map((relative) => {
    const digest = createHash('sha256').update(readFileSync(`${ROOT}/${relative}`)).digest('hex');
    return `${digest}  ${relative}`;
});
const wanted = lines.join('\n') + '\n';

/* A path with a character outside printable ASCII would arrive at the updater
   through a URL and a filesystem, and would be a different string in at least
   one of them. Refuse at the only moment where it is cheap to refuse. */
for (const relative of paths) {
    if (!/^[A-Za-z0-9._/-]+$/.test(relative) || relative.includes('..')) {
        console.error(`server file path unfit for a manifest: ${relative}`);
        process.exit(1);
    }
}

if (process.argv.includes('--check')) {
    const found = existsSync(MANIFEST) ? readFileSync(MANIFEST, 'utf8') : null;
    if (found === wanted) {
        console.log(`server manifest: ${paths.length} files, matches`);
        process.exit(0);
    }
    console.error('server manifest: STALE -- run "node tools/build-server-manifest.mjs"');
    if (found === null) {
        console.error(`  ${MANIFEST} does not exist`);
    } else {
        const had = new Map(found.split('\n').filter(Boolean)
            .map((l) => [l.slice(66), l.slice(0, 64)]));
        const has = new Map(lines.map((l) => [l.slice(66), l.slice(0, 64)]));
        for (const [p, h] of has) {
            if (!had.has(p)) console.error(`  added, not listed   ${p}`);
            else if (had.get(p) !== h) console.error(`  changed since      ${p}`);
        }
        for (const p of had.keys()) if (!has.has(p)) console.error(`  listed, now gone   ${p}`);
    }
    process.exit(1);
}

writeFileSync(MANIFEST, wanted);
console.log(`${MANIFEST}: ${paths.length} files`);
for (const relative of paths) console.log(`  ${relative}`);
