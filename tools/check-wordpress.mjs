#!/usr/bin/env node
/* check-wordpress.mjs -- THE PLUGIN, RUN, AND THE TWO FILES THAT MUST AGREE.
 *
 * A WordPress plugin fails in a way nothing else in this repository does: it is
 * published to a directory that reads `readme.txt` and installs `annotepage.php`,
 * and NOBODY COMPARES THE TWO. A plugin whose header says 1.2.0 and whose readme
 * says `Stable tag: 1.1.0` publishes 1.1.0 to a million sites while its author
 * reads 1.2.0 in their editor. That is not a hypothetical: it is the single most
 * common way a wordpress.org release goes wrong, and the symptom is silence.
 *
 * So the two files are read as one here.
 *
 * The rest is the claims the plugin makes about itself, checked rather than
 * asserted: that it talks to nothing, that it ships no copy of the client, that
 * the key it derives is the key every other component derives -- and that the
 * whole thing actually RUNS, which is what wordpress/tests/run.php does against
 * a stubbed WordPress.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { keyFromText, derive } from '../mcp/src/crypto.mjs';
import { extract, pot, mo, readMo, DOMAIN, LOCALE } from './build-wordpress-languages.mjs';

const read = (p) => readFileSync(p, 'utf8');
const failures = [];
const check = (what, ok, detail) => {
    if (!ok) failures.push(what + (detail ? '\n      ' + String(detail).replace(/\n/g, '\n      ') : ''));
};

const PLUGIN = 'wordpress/annotepage.php';
const README = 'wordpress/readme.txt';
const ADMIN = 'wordpress/admin.js';

const plugin = read(PLUGIN);
const readme = read(README);
const admin = read(ADMIN);

/* -- 1. The header and the readme are one document ----------------------- */

const header = (field) => {
    const m = plugin.match(new RegExp('^\\s*\\*\\s*' + field + ':\\s*(.+?)\\s*$', 'm'));
    return m ? m[1] : '';
};
const readmeField = (field) => {
    const m = readme.match(new RegExp('^' + field + ':\\s*(.+?)\\s*$', 'mi'));
    return m ? m[1] : '';
};

for (const field of ['Plugin Name', 'Description', 'Version', 'Requires at least',
                     'Requires PHP', 'Author', 'License']) {
    check(`the plugin header declares no "${field}"`, header(field) !== '');
}

const version = header('Version');
check(`the plugin header declares version "${version}", which is not x.y.z`,
    /^\d+\.\d+\.\d+$/.test(version), version);

/* THE ONE THAT SHIPS THE WRONG CODE. wordpress.org installs the version named
   by `Stable tag`, and reads it out of readme.txt alone. */
check(`the plugin header says ${version} and readme.txt says `
    + `Stable tag: ${readmeField('Stable tag')} -- wordpress.org installs the `
    + 'readme\'s number, so the directory would serve a version whose code is not this one',
    readmeField('Stable tag') === version);

for (const field of ['Requires at least', 'Requires PHP']) {
    check(`"${field}" is "${header(field)}" in the plugin and `
        + `"${readmeField(field)}" in readme.txt`,
        header(field) === readmeField(field));
}

/* Announced screenshots that do not exist are a blank frame on the plugin's
   page in the directory. The assets live beside the plugin and are uploaded to
   SVN's assets/ directory, not shipped in the zip. */
const shots = (readme.match(/^==\s*Screenshots\s*==\s*\n([\s\S]*?)(?=^==|\Z)/m) || ['', ''])[1];
const announced = (shots.match(/^\d+\.\s/gm) || []).length;
const assets = existsSync('wordpress/assets') ? readdirSync('wordpress/assets') : [];
for (let i = 1; i <= announced; i += 1) {
    check(`readme.txt announces screenshot ${i} and wordpress/assets/ has no `
        + `screenshot-${i}.png or .jpg -- the directory shows an empty frame`,
        assets.some((f) => new RegExp(`^screenshot-${i}\\.(png|jpg|jpeg|gif)$`).test(f)),
        assets.join(', ') || '(no assets directory)');
}

/* -- 2. It talks to nothing ---------------------------------------------- */

const stripPhpComments = (text) => text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*(\/\/|#).*$/gm, '');

const NETWORK_PHP = /\b(wp_remote_\w+|curl_init|curl_exec|fsockopen|stream_socket_client|wp_safe_remote_\w+)\b|\b(file_get_contents|fopen)\s*\(\s*['"]https?:/;
check('the plugin makes an HTTP call -- its readme says it does not, and that '
    + 'sentence is the reason somebody installs it on a client site',
    !NETWORK_PHP.test(stripPhpComments(plugin)),
    (stripPhpComments(plugin).match(NETWORK_PHP) || [])[0]);

const NETWORK_JS = /\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts)\s*\(|new\s+Image\s*\(/;
const adminCode = admin
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
check('admin.js transmits something. The key is drawn there precisely because '
    + 'nothing in that file reaches the network',
    !NETWORK_JS.test(adminCode), (adminCode.match(NETWORK_JS) || [])[0]);

/* -- 3. It ships no copy of the client ----------------------------------- */

const shipped = readdirSync('wordpress').filter((f) => !f.startsWith('.'));
check('the plugin directory carries a JavaScript file other than admin.js -- a '
    + 'copy of the client here is a release of this plugin every time the client '
    + 'moves, forever', shipped.filter((f) => f.endsWith('.js')).join(',') === 'admin.js',
    shipped.join(', '));

const src = (plugin.match(/ANNOTEPAGE_CLIENT_SRC',\s*'([^']+)'/) || [])[1] || '';
check('the client address is not a floating major range on the CDN, so a fix '
    + 'would reach these sites only when this plugin is released again',
    /^https:\/\/cdn\.jsdelivr\.net\/npm\/annotepage-client@2\//.test(src), src);

/* THE DEFAULT SERVER IS THE ONE THE SITE DOCUMENTS. The plugin fills it in at
   activation, so a wrong one here is a site quietly writing its notes nowhere. */
const relay = (plugin.match(/ANNOTEPAGE_DEFAULT_SERVER',\s*'([^']+)'/) || [])[1] || '';
check('the default server address is not the relay the site documents',
    readFileSync('docs/how-to-install-it.html', 'utf8').includes(relay)
    && /^https:\/\//.test(relay), relay);

/* -- 4. Nothing from a request is echoed -------------------------------- */

stripPhpComments(plugin).split('\n').forEach((line, i) => {
    if (/\becho\b/.test(line) && /\$_(POST|GET|REQUEST|SERVER|COOKIE)/.test(line)) {
        check(`${PLUGIN}:${i + 1} echoes a superglobal`, false, line.trim());
    }
});

/* -- 5. It runs ---------------------------------------------------------- */

const php = spawnSync('php', ['-v'], { encoding: 'utf8' });
if (php.error || php.status !== 0) {
    console.error('wordpress: no php on this machine, and the plugin is PHP. '
        + 'Install php, or this check proves nothing.');
    process.exit(1);
}

for (const file of [PLUGIN, 'wordpress/tests/run.php']) {
    const lint = spawnSync('php', ['-l', file], { encoding: 'utf8' });
    check(`${file} does not parse`, lint.status === 0, lint.stdout + lint.stderr);
}

const run = spawnSync('php', ['wordpress/tests/run.php'], { encoding: 'utf8' });
check('the plugin harness failed', run.status === 0,
    (run.stdout || '') + (run.stderr || ''));

/* -- 6. The key PHP derives is the key everything else derives ----------- */

/* PHP derives the project id so the settings screen can SHOW it -- which is
   how somebody sharing one key between dev, staging and production sees that
   the three landed on the same project. A drift here would show them an id
   the client never computes, and nothing would raise an error: they would
   simply be looking at the wrong 22 characters while believing the sites
   agree. admin.js is compared with the MCP by check-landing-derivation.mjs;
   this is the same comparison for the PHP.  */
const derived = (run.stdout || '').match(/^DERIVED (\S+) (\S*)$/m);
check('the harness printed no derived id for this check to compare', Boolean(derived),
    (run.stdout || '').slice(-300));
if (derived) {
    const bytes = keyFromText(derived[1]);
    const theirs = (await derive(bytes)).id;
    check(`PHP derives ${derived[2]} where the mcp derives ${theirs} -- the `
        + 'settings screen would name a project the client does not compute',
        derived[2] === theirs);
}

/* -- 7. Every string somebody reads is translated, and French covers them all
 *
 * THREE WAYS THIS BREAKS, AND NOT ONE OF THEM RAISES ANYTHING.
 *
 *   A string added without __() is simply English forever, on a screen that is
 *   otherwise French. A call written with the wrong domain -- or with none --
 *   asks WordPress for a translation in core's domain, which answers with the
 *   original: the same silence, from a line that looks right. And a French set
 *   with a hole in it ships a screen that is half one language and half the
 *   other, which reads as a decision somebody made.
 *
 * The last one is why 100% is the rule here rather than a target. A partial
 * translation is worse than none: an English plugin is coherent, and an
 * English-and-French one looks like a defect in the site.
 *
 * The msgids come from the PHP and from nowhere else, so there is no second
 * list to keep in step: what the code says is what the .pot offers and what the
 * French must answer.
 */
{
    const LANG = 'wordpress/languages';
    /* Three characters that stand for what the plugin's own text can never
       hold: the byte gettext separates a plural's halves with, and the two
       markers this check writes over PHP blocks and over HTML tags. Built and
       not typed, for the reason the generator gives beside its own. */
    const NUL = String.fromCharCode(0);
    const MARK = String.fromCharCode(1);
    const TAG = String.fromCharCode(2);
    const POT = `${LANG}/${DOMAIN}.pot`;
    const MO = `${LANG}/${DOMAIN}-${LOCALE}.mo`;
    const JSON_SOURCE = `${LANG}/${LOCALE}.json`;

    const { entries, problems } = extract(plugin);
    for (const problem of problems) {
        check('a translation call cannot be extracted, so its string would never '
            + 'reach a translator', false, problem);
    }

    /* -- the header wordpress.org reads -- */
    check(`the plugin header declares Text Domain "${header('Text Domain')}" where `
        + `wordpress.org requires the slug, "${DOMAIN}" -- a domain that is not the `
        + 'slug is a plugin whose translations the directory never delivers',
        header('Text Domain') === DOMAIN);
    check(`the plugin header declares Domain Path "${header('Domain Path')}", and the `
        + `translations it ships are in ${LANG}`, header('Domain Path') === '/languages');
    /* THE CALL IS GONE, AND THIS IS WHAT KEEPS IT GONE.
       It was here at first, alongside the Domain Path header, on the reasoning
       that the header's behaviour had only been measured on one version. Plugin
       Check then raised it as the single warning this plugin had: WordPress has
       discouraged load_plugin_textdomain() since 4.6 for a plugin in the
       directory. Measured before removing it -- WordPress 7.1, site in French,
       call deleted -- core still loads the shipped .mo out of Domain Path and
       __('Draw a key') answers "Tirer une cle". Putting it back to be safe
       trades a warning a reviewer reads for a benefit nobody has measured. */
    check('the plugin calls load_plugin_textdomain(). WordPress discourages it since '
        + '4.6 for a plugin in the directory and Plugin Check warns on it, while the '
        + 'Domain Path header loads the shipped .mo without it -- measured, not assumed',
        !/load_plugin_textdomain\s*\(/.test(stripPhpComments(plugin)));

    /* -- every call in our own domain -- */
    for (const entry of entries) {
        check(`${entry.references[0]}: ${entry.fn}() is in domain `
            + `${JSON.stringify(entry.domain)} and not "${DOMAIN}" -- WordPress would `
            + 'answer from core\'s own translations, which is to say not at all',
            entry.domain === DOMAIN, entry.msgid);
    }

    /* -- NOTHING DISPLAYED ESCAPES A TRANSLATION CALL --
     *
     * The plugin is read as what it is: PHP with HTML between its blocks. Each
     * <?php ... ?> is replaced by one character, which leaves the templates as
     * plain HTML -- and text left in an HTML text node, or in an attribute a
     * person reads, is text no translation can ever reach.
     *
     * THE ONE EXCEPTION IS THE PROJECT'S OWN NAME. "annotepage" is a name; it
     * is the same word in every language, and CONVENTIONS.md says so. Nothing
     * else is allowed through. */
    const pieces = plugin.split(/<\?php|\?>/);
    const code = pieces.filter((_, i) => i % 2 === 1).join('\n');
    const templates = pieces.filter((_, i) => i % 2 === 0).join('\n' + MARK + '\n');

    const entity = /&(?:[a-z]+|#\d+);/gi;
    const prose = (text) => {
        const left = text.replace(entity, ' ').replace(new RegExp('[' + MARK + TAG + ']', 'g'), ' ').trim();
        return left === DOMAIN ? '' : ((left.match(/[A-Za-z]{2,}/g) || []).length ? left : '');
    };

    for (const node of templates.replace(/<[^>]*>/g, TAG).split(TAG)) {
        const left = prose(node);
        check('this text is printed as it stands, so it is English on every site: '
            + JSON.stringify(left.replace(/\s+/g, ' ').slice(0, 70)), left === '');
    }

    for (const [, attribute, value] of templates.matchAll(
        /\b(placeholder|title|alt|aria-label)\s*=\s*"([^"]*)"/gi)) {
        check(`the ${attribute} attribute is written in English and cannot be `
            + 'translated: ' + JSON.stringify(value), prose(value) === '');
    }

    /* And in the PHP, a literal that reads like a sentence and is not one of the
       strings just extracted. Markup, paths, option names and regexps are not
       sentences: they carry a character no sentence of ours does. */
    const said = new Set(entries.flatMap((e) => [e.msgid, e.plural]).filter(Boolean));
    const literals = [...stripPhpComments(code).matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)]
        .map((m) => (m[1] === undefined ? m[2] : m[1]));
    for (const value of literals) {
        if (said.has(value) || !value.includes(' ') || /[<>={}$\\/]/.test(value)) continue;
        check('this string is printed without passing through a translation call: '
            + JSON.stringify(value), (value.match(/[A-Za-z]{2,}/g) || []).length < 2);
    }

    /* -- AND admin.js WRITES NO SENTENCE OF ITS OWN --
     *
     * Its live messages were English literals, so a French site had a French
     * screen whose key messages and new-key confirmation stayed English -- and
     * no rule above could see it, because every rule above reads the PHP. They
     * now come from annotepage_admin_text(). This keeps it that way: a sentence
     * typed into the script is refused, and every sentence the script asks for
     * exists on the PHP side, or the screen would print "undefined". */
    {
        const js = read(ADMIN).replace(/\/\*[\s\S]*?\*\//g, '');
        for (const [, value] of js.matchAll(/'((?:[^'\\]|\\.)*)'/g)) {
            /* The directive is a string with a space in it, and not a sentence. */
            if (value === 'use strict') continue;
            if (!value.includes(' ') || /[<>={}$\\/]/.test(value)) continue;
            check('admin.js writes this sentence itself, so it is English on every site -- '
                + 'hand it over from annotepage_admin_text(): ' + JSON.stringify(value),
                (value.match(/[A-Za-z]{2,}/g) || []).length < 2);
        }
        const start = plugin.indexOf('function annotepage_admin_text()');
        const body = start === -1 ? '' : plugin.slice(start, plugin.indexOf('\n}\n', start));
        const offered = new Set([...body.matchAll(/'(\w+)'\s*=>\s*__\(/g)].map((m) => m[1]));
        const asked = new Set([...js.matchAll(/\bT\.(\w+)/g)].map((m) => m[1]));
        check('annotepage_admin_text() is missing or hands admin.js no sentence', offered.size > 0);
        for (const k of asked) {
            check(`admin.js reads T.${k} and annotepage_admin_text() does not provide it -- `
                + 'the screen would print "undefined"', offered.has(k));
        }
        for (const k of offered) {
            check(`annotepage_admin_text() provides "${k}" and admin.js never reads it -- a `
                + 'sentence translated for nothing', asked.has(k));
        }
    }

    /* -- the two generated files ARE what their sources make -- */
    check(`${POT} is not what the plugin's strings make -- run `
        + 'node tools/build-wordpress-languages.mjs',
        existsSync(POT) && read(POT) === pot(entries, version));

    const french = existsSync(JSON_SOURCE) ? JSON.parse(read(JSON_SOURCE)) : {};

    /* -- 100%, BOTH WAYS -- */
    const missing = entries.filter((e) => !(e.msgid in french)).map((e) => e.msgid);
    check(`${missing.length} string(s) reach the screen with no French, so a French `
        + 'site gets half a screen in each language',
        missing.length === 0, missing.map((s) => JSON.stringify(s)).join('\n'));

    const extra = Object.keys(french).filter((k) => !said.has(k));
    check(`${JSON_SOURCE} translates ${extra.length} string(s) the plugin no longer `
        + 'says, which is how a translation rots without anybody noticing',
        extra.length === 0, extra.map((s) => JSON.stringify(s)).join('\n'));

    for (const entry of entries) {
        const value = french[entry.msgid];
        if (value === undefined) continue;

        const plural = entry.plural !== null;
        check(`"${entry.msgid}" is ${plural ? 'a plural' : 'a single'} string and its `
            + `French is ${Array.isArray(value) ? 'a list' : 'one string'}`,
            plural === Array.isArray(value));

        const forms = Array.isArray(value) ? value : [value];
        check(`"${entry.msgid}" has an empty French translation, which WordPress `
            + 'answers by falling back to English -- silently',
            forms.every((f) => typeof f === 'string' && f.trim() !== ''));

        /* A PLACEHOLDER LOST IN TRANSLATION IS A SENTENCE WITH A HOLE IN IT, and
           sprintf does not complain: it prints the sentence without the address,
           the count or the name it was about.

           AND A SENTENCE IDENTICAL IN BOTH LANGUAGES WAS COPIED, NOT TRANSLATED
           -- the hole that survives a coverage count, because the key is there
           and the value is not empty. Found by breaking this file on purpose,
           and tests/run.php cannot see it either: a runtime comparison has to
           let an unchanged string pass. Single words are exempt and have to be:
           "Version" and "Mode" are the same word in French, and inventing a
           difference would be worse than leaving one alone. */
        const holders = (s) => (String(s).match(/%\d+\$s|%[sd]/g) || []).sort().join(' ');
        const english = plural ? [entry.msgid, entry.plural] : [entry.msgid];
        english.forEach((source, i) => {
            if (forms[i] === undefined) return;
            check(`the French for "${source}" carries ${JSON.stringify(holders(forms[i]))} `
                + `where the English carries ${JSON.stringify(holders(source))}`,
                holders(forms[i]) === holders(source));
            check(`the French for "${source}" is the English, word for word. A `
                + 'sentence copied across is not a translation, and a count of covered '
                + 'strings cannot tell the two apart',
                forms[i] !== source || !/\s/.test(source));
        });
    }

    /* -- the .mo, built and then READ BACK --
     *
     * A writer that agrees with itself proves nothing about a file another
     * program has to parse, so the shipped bytes are parsed here by the format's
     * own rules and every string is looked up in what comes out. */
    const built = mo(entries, french, version);
    check(`${MO} is not what ${JSON_SOURCE} makes -- run `
        + 'node tools/build-wordpress-languages.mjs',
        existsSync(MO) && Buffer.compare(built, readFileSync(MO)) === 0);

    if (existsSync(MO)) {
        const table = readMo(readFileSync(MO));
        for (const entry of entries) {
            const key = entry.plural === null ? entry.msgid : entry.msgid + NUL + entry.plural;
            check(`reading ${MO} back finds no translation for "${entry.msgid}"`,
                typeof table[key] === 'string' && table[key] !== '');
        }
        check(`${MO} does not declare the plural rule French uses -- with English's, `
            + '"0 role" comes out "0 roles"', /plural=n > 1/.test(table[''] || ''));
        check(`${MO} does not name its locale`, /Language: fr_FR/.test(table[''] || ''));
    }
}

/* -- 8. The zip the site hands out IS this plugin ------------------------ */

/* The site's menu offers the plugin as a zip, because the directory has not
   accepted it yet. A zip in docs/ is a COPY, and a copy is a thing that goes
   stale in silence: the plugin gets a fix, the page keeps offering last week's
   archive, and the person who downloads it has no way of knowing. Exactly the
   failure docs/annotepage-client-<version>.js has a guard for.
 *
 * COMPARED BY CONTENT, NOT BY BYTES, and that is not a weaker check -- it is
 * the only correct one. A zip records a modification time per entry, so
 * rebuilding it from identical sources produces a different file. Comparing
 * archives would fail on a correct repository, which is the guard that gets
 * switched off.
 *
 * The list of entries is checked too. `tests/` is a stubbed WordPress and
 * `README.md` is for whoever reads the code here: neither has any business on
 * somebody's server, and this is the only place that would notice them
 * shipping. */
{
    const zips = readdirSync('docs').filter((f) => /^annotepage-wordpress-.+\.zip$/.test(f));
    check('docs/ serves no plugin zip, and the site links to one', zips.length === 1,
        zips.join(', ') || '(none)');

    if (zips.length === 1) {
        const served = `docs/${zips[0]}`;
        /* AND EVERY PAGE THAT OFFERS IT POINTS AT THAT NAME. The file carries
           the version in its own name, so the day the plugin is released again
           the file is renamed and four hand-written links in docs/ go on naming
           a file that no longer exists -- a download that answers 404, on the
           four pages of the site, with nothing anywhere saying so. The zip is
           checked against the declared version just below; this checks that the
           links were dragged along with it. */
        const OFFERED = ['docs/index.html', 'docs/how-to-use-it.html',
                         'docs/how-to-install-it.html', 'docs/questions.html'];
        for (const page of OFFERED) {
            const text = read(page);
            const named = [...text.matchAll(/annotepage-wordpress-[\d.]+\.zip/g)]
                .map((m) => m[0]);
            check(`${page} offers no plugin zip at all -- it is one of the pages `
                + 'whose Source menu hands it out', named.length > 0);
            for (const link of new Set(named)) {
                check(`${page} links to ${link} and the file served is ${zips[0]}. `
                    + 'That link answers 404: the zip carries its version in its name, '
                    + 'so a release renames it and every page naming the old one has '
                    + 'to follow.', link === zips[0], link);
            }
        }

        check(`${zips[0]} does not name the declared version ${version} -- the site `
            + 'would hand out a version nobody decided to release',
            zips[0] === `annotepage-wordpress-${version}.zip`);

        const listed = spawnSync('unzip', ['-Z1', served], { encoding: 'utf8' });
        check(`${served} could not be read (is unzip installed?)`, listed.status === 0,
            listed.stderr);

        const entries = (listed.stdout || '').split('\n')
            .filter((n) => n && !n.endsWith('/'));
        /* languages/ SHIPS, AND THAT IS THE WHOLE POINT OF IT. The .mo is read
           from inside the plugin -- see the plugin header -- so a zip without it
           is an English plugin however complete the French is in this
           repository. The .pot and the JSON beside it are what another language
           is made from, and the template is where wordpress.org expects it. */
        const wanted = ['annotepage/annotepage.php', 'annotepage/admin.js',
                        'annotepage/readme.txt',
                        'annotepage/languages/annotepage.pot',
                        'annotepage/languages/annotepage-fr_FR.mo',
                        'annotepage/languages/fr_FR.json'];

        check(`${served} holds ${entries.join(', ')} -- the published plugin is `
            + wanted.join(', '), entries.slice().sort().join() === wanted.slice().sort().join());

        for (const entry of entries) {
            const source = 'wordpress/' + entry.replace(/^annotepage\//, '');
            if (!existsSync(source)) continue;
            const inside = spawnSync('unzip', ['-p', served, entry], { encoding: 'buffer' });
            check(`${entry} inside ${zips[0]} differs from ${source}. The site is `
                + 'handing out a plugin that is not this one: rebuild the zip.',
                inside.status === 0 && Buffer.compare(inside.stdout, readFileSync(source)) === 0);
        }
    }
}

/* -- 9. The tag goes out through the queue, and none of it is hand-written
 *
 * THE PLUGIN DIRECTORY'S SCANNER READS A LITERAL, and this is that literal.
 * WordPress.WP.EnqueuedResources.NonEnqueuedScript matches `<script ... src=`
 * inside any string, heredoc or run of inline HTML. So the check here is the
 * sniff's own regular expression, over the same file, with comments taken out
 * -- because the sniff reads tokens, and a comment is not one.
 *
 * IT IS NOT A LINTER BEING APPEASED. A plugin that writes its own script tag is
 * a plugin the queue cannot see: no dependency, no loading strategy, and no way
 * for the site's own code to filter what it emits. The tag is enqueued now, and
 * what keeps it enqueued is that hand-writing one again fails here.
 *
 * AND THE WAY ROUND THIS IS NAMED SO THAT IT IS NOT TAKEN BY ACCIDENT: breaking
 * the literal in two -- '<scr' . 'ipt src=' -- would satisfy the sniff and
 * satisfy this check while putting the hand-written tag straight back. That is
 * not a fix, it is a costume. Whoever does it has to delete this paragraph
 * first, which is the only protection a check can offer against itself.
 */
{
    const code = stripPhpComments(plugin);
    const HAND_WRITTEN = /<script[^>]*(?<=src=)/;

    check('annotepage.php writes a <script ... src= by hand, which is what the '
        + 'directory\'s scanner reports. The tag is enqueued: core writes the '
        + 'frame and only the attributes are this plugin\'s',
        !HAND_WRITTEN.test(code), (code.match(HAND_WRITTEN) || [])[0]);

    check('the client is never handed to wp_enqueue_script(), so nothing puts it '
        + 'in the queue at all',
        /wp_enqueue_script\(\s*'annotepage',\s*ANNOTEPAGE_CLIENT_SRC/.test(code));

    check('the data- attributes are not put back on script_loader_tag, so the tag '
        + 'would reach the page carrying nothing the client can read',
        /add_filter\(\s*'script_loader_tag'/.test(code));

    /* BOTH DECLARATIONS, OR THE OTHER ONE IS WORSE THAN USELESS. The client
       configures a copy from one source and never merges two: it refuses a
       readable tag beside an object that says anything different, and names the
       setting. So the object is not a belt-and-braces extra to be dropped the
       day it looks redundant -- and neither are the attributes, which are all a
       browser still holding client 2.27 can read. tests/run.php compares what
       the two actually emit, on the page; this refuses their disappearance. */
    check('window.annotepageConfig is not declared, so a client that cannot read '
        + 'document.currentScript -- concatenated, inlined, loaded as a module -- '
        + 'has nothing left to configure itself from and stands down in silence',
        /window\.annotepageConfig = /.test(code) && /wp_add_inline_script\(/.test(code));
}

/* -- Verdict ------------------------------------------------------------- */

if (failures.length) {
    console.error('wordpress:\n' + failures.map((f) => '  ' + f).join('\n'));
    process.exit(1);
}
console.log('wordpress: header and readme.txt agree on version, PHP and WordPress; '
    + 'every announced screenshot exists; the plugin and its admin script reach no '
    + 'network; no client code ships with it and the CDN range still floats; the '
    + 'default relay is the documented one; every string the screen shows passes '
    + "through a translation call in this plugin's own domain and the French set "
    + 'covers all of them, in a .pot and a .mo that are what their sources make; the '
    + 'zip the site hands out holds exactly the published files, languages/ included, '
    + 'and their current content; the plugin runs against a stubbed WordPress and the '
    + 'id its PHP derives is the one the mcp derives');
