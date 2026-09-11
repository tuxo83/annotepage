#!/usr/bin/env node
/* check-origins.mjs — THE DOMAIN LOCK, AND THE ONE PATTERN IT ACCEPTS.
 *
 * A declaration may cover every subdomain, written out: `https://*.example.com`
 * (FORMAT.md section 6.2). That is the only place in the server where a string
 * comparison stops being exact, so it is held here by a table rather than by
 * trust -- through ap_apply_origin_lock() itself, the function api.php calls,
 * with a real configuration and a real Origin header.
 *
 * WHAT MADE THIS WORTH A FILE. Before the pattern existed, `https://*.example.com`
 * was accepted by the configuration without a word and matched nothing -- no
 * browser ever sends a `*` -- so an operator who wrote one got a project that
 * refused every page, silently. And the obvious way to add the pattern lets a
 * request that SENDS `Origin: https://*.example.com` equal the declaration as
 * a string. Both are rows below.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const internal = join(here, '..', 'server', 'webroot', 'internal');

const probe = spawnSync('php', ['-r', 'echo 1;'], { encoding: 'utf8' });
if (probe.error || probe.status !== 0) {
    console.log('origins: no php on this machine, nothing was checked');
    process.exit(0);
}

/* One PHP run per verdict: ap_declared_projects() memoises, and the lock reads
   $_SERVER, so a fresh process is the only honest way to vary either. */
const lock = (declared, origin) => {
    const code = 'define("AP_INTERNAL", 1);'
        + ' foreach (array("errors.php", "config.php", "origins.php") as $f) {'
        + '   require ' + JSON.stringify(internal) + ' . "/" . $f; }'
        + ' $_SERVER["HTTP_ORIGIN"] = ' + JSON.stringify(origin) + ';'
        + ' $config = array_merge(ap_config_defaults(), array("projects" => array('
        + '   "AAAAAAAAAAAAAAAAAAAAAA" => array("origins" => '
        + '   json_decode(' + JSON.stringify(JSON.stringify(declared)) + ', true)))));'
        + ' try { $p = ap_declared_projects($config);'
        + '   ap_apply_origin_lock($config, "AAAAAAAAAAAAAAAAAAAAAA",'
        + '     $p["AAAAAAAAAAAAAAAAAAAAAA"], true); echo "allowed"; }'
        + ' catch (ApFailure $e) { echo ($e->status() === 500 ? "config" : ($e->status() === 403 ? "refused" : "status " . $e->status())),'
        + '   "|", strtok($e->getMessage(), "\\n"); }';
    const r = spawnSync('php', ['-r', code], { encoding: 'utf8' });
    return ((r.stdout || '') + (r.stderr || '')).trim();
};

const failures = [];
const expect = (declared, origin, want, why) => {
    const got = lock(declared, origin);
    if (!got.startsWith(want)) {
        failures.push(`${why}\n    declared ${JSON.stringify(declared)}, Origin ${origin}\n`
            + `    expected ${want}, got ${got}`);
    }
};

const star = ['https://*.example.com'];
expect(star, 'https://a.example.com', 'allowed', 'one label under the pattern is refused');
expect(star, 'https://b.a.example.com', 'allowed', 'two labels under the pattern are refused -- it is any depth');
expect(star, 'https://example.com', 'refused', 'the bare domain passes a pattern that asks for subdomains');
expect(star, 'https://evil-example.com', 'refused', 'a host that merely ENDS in the same letters passes');
expect(star, 'https://example.com.evil.net', 'refused', 'a host that merely CONTAINS the domain passes');
expect(star, 'http://a.example.com', 'refused', 'another scheme passes the pattern');
expect(star, 'https://a.example.com:8443', 'refused', 'another port passes the pattern');
expect(['https://*.intra.local:8443'], 'https://x.intra.local:8443', 'allowed', 'a pattern with a port refuses its own port');
expect(star, 'https://*.example.com', 'refused', 'a request that SENDS the pattern is let through by it');

expect(['https://www.example.com'], 'https://www.example.com', 'allowed', 'an exact origin stopped matching itself');
expect(['https://www.example.com'], 'https://a.www.example.com', 'refused', 'an exact origin started covering subdomains');

expect(['https://*.com'], 'https://a.com', 'config', 'a star over a single label is accepted -- every site on a top-level domain');
expect(['https://a*.example.com'], 'https://ab.example.com', 'config', 'a star inside a label is accepted');
expect(['https://*.*.example.com'], 'https://a.b.example.com', 'config', 'two stars are accepted');

if (failures.length) {
    console.error('origins:\n  ' + failures.join('\n  '));
    process.exit(1);
}
console.log('origins: 14 verdicts of the real lock -- a pattern covers subdomains at any depth and nothing '
    + 'else, a request never carries one, and a malformed one stops the configuration');
