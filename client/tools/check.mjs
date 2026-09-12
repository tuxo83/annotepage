/* ============================================================================
   check.mjs -- THE VECTORS OF THE FORMAT, CHECKED AT EVERY BUILD.

   This is not an interface test suite: nothing here touches the DOM. We check
   the only part of the client that ANOTHER implementation has to reproduce
   bit for bit -- the derivations, the blind index, the envelope. The PHP
   server and the MCP package can copy the vectors below to make sure they are
   talking about the same format.

   The crypto sections are loaded AS THEY ARE from src/: there is no second
   implementation to maintain, hence no second implementation to diverge.

   The two expected values below were cross-checked against a second
   implementation of HKDF-SHA-256 written by hand from RFC 5869, and not
   copied from the output of the code under test: without that cross-check, a
   test that freezes its own mistake passes for ever. That is how we check, in
   particular, that the key is the IKM and "annotepage/1" the key, and not
   the other way round -- both "work", only one is the format.

   No dependency. "node tools/check.mjs".
   ============================================================================ */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');

const read = (name) => readFileSync(join(SRC, name), 'utf8');

/* The same assembly as the build, cut down to the sections that depend on no
   DOM. "window" is cut down to what those sections read: if one of them ever
   starts touching the document, this file falls over, and that is the point.

   AND "document" ANSWERS EXACTLY ONE QUESTION: the lang attribute of <html>.
   Two things read the page's language now -- the dates and the choice of
   label set -- and they read it through one function, which these checks
   call. Nothing else is on that object, so a section that starts querying the
   document still falls over here, which is what this harness is for. */
const page = { lang: null };
const window = { crypto: webcrypto };
const document = { documentElement: {
    getAttribute: (name) => (name === 'lang' ? page.lang : null) } };
const code = [
    read('10-utils.js'),
    /* 15-labels.js is data and nothing but data: the English set T() falls
       back on. It is loaded here so that the fallback can be PROVEN rather
       than described -- a label file that never arrives leaves exactly these
       words on the screen. */
    read('15-labels.js'),
    read('20-crypto.js'),
    /* 80-upgrade.js joins them for the same reason: its decisions -- is that
       announced version newer, does it even look like a version, which
       address do we build from it, which label set ships beside this file --
       are pure, they touch no DOM, and they are the ones a hostile answer
       would try to bend. Everything in that file that touches the document is
       inside a function, so evaluating it here costs nothing. */
    read('80-upgrade.js'),
    'return { b64url, fromB64url, generateSalt, keyFromText, derive,',
    '         indexOfPath, seal, open, compact, T, pageLanguage,',
    '         versionNumbers, announcedVersion, cdnServing, officialUrl,',
    '         shippedLabelsFor, shippedLabelsUrl, labelsFileFor };'
].join('\n');

/* The same values the build injects, and for the same reason: these sections
   do not declare them, they receive them. */
const FORMAT = 2;
const TOOL_VERSION = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8')).version;
const SITE_VERSION = '';
const module = new Function('window', 'document', 'FORMAT', 'TOOL_VERSION', 'SITE_VERSION', code)(
    window, document, FORMAT, TOOL_VERSION, SITE_VERSION);

let failures = 0;
const check = (name, got, expected) => {
    const ok = got === expected;
    if (!ok) failures += 1;
    process.stdout.write((ok ? '  ok   ' : '  FAIL ') + name + '\n');
    if (!ok) {
        process.stdout.write('        got      : ' + got + '\n');
        process.stdout.write('        expected : ' + expected + '\n');
    }
};

/* The key of the vector: bytes 0 to 31, in order. Chosen so that another
   implementation can reproduce it without copying a string. */
const vectorBytes = new Uint8Array(32);
for (let i = 0; i < 32; i += 1) vectorBytes[i] = i;
const VECTOR_SALT = module.b64url(vectorBytes);

const main = async () => {
    process.stdout.write('base64url\n');
    check('key of the vector (43 characters)', VECTOR_SALT,
        'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8');
    check('round trip', module.b64url(module.fromB64url(VECTOR_SALT)), VECTOR_SALT);
    check('a malformed key is refused', module.keyFromText(VECTOR_SALT + 'X'), null);
    check('a spaced key is refused', module.keyFromText('AAEC AwQF'), null);

    process.stdout.write('HKDF-SHA-256 derivations, key "annotepage/1"\n');
    const keys = await module.derive(vectorBytes);
    check('project id (22 characters)', keys.id, 'Up4tgMk-kJmJl1MUMuC5yA');

    process.stdout.write('blind index HMAC-SHA-256\n');
    check('index of /fr/contact.html',
        await module.indexOfPath(keys.indexKey, '/fr/contact.html'),
        'q4DHRWupkdur4kJu11zQWA');
    check('case matters', await module.indexOfPath(keys.indexKey, '/Contact')
        === await module.indexOfPath(keys.indexKey, '/contact'), false);
    check('the trailing slash matters', await module.indexOfPath(keys.indexKey, '/a/')
        === await module.indexOfPath(keys.indexKey, '/a'), false);

    process.stdout.write('AES-256-GCM envelope\n');
    const project = keys.id;
    const index = await module.indexOfPath(keys.indexKey, '/fr/contact.html');
    const note = { page: '/fr/contact.html', author: 'Camille', text: 'The link points elsewhere.', empty: '' };

    const envelope = await module.seal(keys.encryptionKey, project, index, 'note', note);
    check('format prefix', envelope.slice(0, 4), 'ap2.');
    check('nonce length', envelope.split('.')[1].length, 16);

    const opened = await module.open(keys.encryptionKey, project, index, 'note', envelope);
    check('text round trip', opened.text, note.text);
    check('an empty field is ABSENT', Object.prototype.hasOwnProperty.call(opened, 'empty'), false);

    const second = await module.seal(keys.encryptionKey, project, index, 'note', note);
    check('two encryptions, two nonces', envelope === second, false);

    const reason = async (promise) => {
        try {
            await promise;
            return 'none';
        } catch (e) {
            return e && e.reason ? e.reason : 'unexpected';
        }
    };
    check('note moved to another page: refused',
        await reason(module.open(keys.encryptionKey, project, 'AAAAAAAAAAAAAAAAAAAAAA', 'note', envelope)),
        'unreadable');
    check('role swapped: refused',
        await reason(module.open(keys.encryptionKey, project, index, 'resolution', envelope)),
        'unreadable');
    check('another project: refused',
        await reason(module.open(keys.encryptionKey, 'AAAAAAAAAAAAAAAAAAAAAA', index, 'note', envelope)),
        'unreadable');
    check('a more recent format: FLAT refusal, and distinct',
        await reason(module.open(keys.encryptionKey, project, index, 'note', 'ap9' + envelope.slice(3))),
        'newer');
    check('a nonce of another length: refused',
        await reason(module.open(keys.encryptionKey, project, index, 'note', 'ap2.AAAA.' + envelope.split('.')[2])),
        'unreadable');

    /* -- The announcement a stale copy acts on -----------------------------
       It rides on the `list` answer, so it comes from a server that may be
       anybody's: a relay, a self-hosted install, or something pretending to
       be one. Everything below is what stands between that string and a
       <script src> the visitor's browser will run.

       The versions are derived from TOOL_VERSION rather than written down,
       so that the next release does not silently turn "newer" into "older"
       and leave these lines passing for the wrong reason. */
    process.stdout.write('the announced client version\n');
    const mine = module.versionNumbers(TOOL_VERSION);
    const newer = (mine[0] + 1) + '.0.0';
    const older = (mine[0] - 1) + '.9.9';
    const announced = (value) => module.announcedVersion({ client_version: value });

    check('a newer version is passed on', announced(newer), newer);
    check('our own version: silence', announced(TOOL_VERSION), null);
    check('an older version: silence', announced(older), null);
    check('no field at all: silence', module.announcedVersion({}), null);
    check('no answer at all: silence', module.announcedVersion(null), null);
    check('not a string: silence', module.announcedVersion({ client_version: 3 }), null);
    check('two numbers: silence', announced('2.1'), null);
    /* The last group is four digits ON PURPOSE. Four groups of at most three
       digits each is the shape of an IP address, and the repository's leak
       guard refuses a push over anything that looks like one -- it cannot know
       this is a version. Same case tested, four numbers where three are
       expected, without wearing that shape. Do not shorten it. */
    check('four numbers: silence', announced('2.1.1.1000'), null);
    check('a pre-release: silence', announced('99.0.0-rc.1'), null);
    check('a leading zero: silence', announced('099.0.0'), null);
    check('a space around it: silence', announced(' 99.0.0'), null);
    check('a newline after it: silence', announced('99.0.0\n'), null);

    process.stdout.write('what a version number can never become\n');
    const jsdelivr = module.cdnServing(
        'https://cdn.jsdelivr.net/npm/annotepage-client@2/dist/annotepage.js');
    check('the range URL is recognised as jsDelivr', !!jsdelivr, true);
    check('unpkg too', !!module.cdnServing(
        'https://unpkg.com/annotepage-client@2/dist/annotepage.js'), true);
    check('a copy served by the site is NOT a CDN', module.cdnServing(
        'https://annotepage.com/annotepage-client-2.1.0.js'), null);
    check('a look-alike host is NOT a CDN', module.cdnServing(
        'https://cdn.jsdelivr.net.example.com/npm/annotepage-client@2/dist/annotepage.js'), null);
    check('another package on the same CDN is NOT a CDN copy', module.cdnServing(
        'https://cdn.jsdelivr.net/npm/something-else@2/dist/annotepage.js'), null);
    check('http is NOT a CDN', module.cdnServing(
        'http://cdn.jsdelivr.net/npm/annotepage-client@2/dist/annotepage.js'), null);

    check('the address is REBUILT, never received',
        module.officialUrl(jsdelivr, newer),
        'https://cdn.jsdelivr.net/npm/annotepage-client@' + newer + '/dist/annotepage.js');
    /* The four below are the whole point of building the URL ourselves: none
       of them can reach officialUrl through announcedVersion, and none of
       them produces an address even when handed to it directly. */
    check('a path escape builds nothing',
        module.officialUrl(jsdelivr, '2.1.1/../../evil@1/x.js'), null);
    check('another origin builds nothing',
        module.officialUrl(jsdelivr, 'https://evil.example.com/x.js'), null);
    check('a protocol-relative address builds nothing',
        module.officialUrl(jsdelivr, '//evil.example.com/x.js'), null);
    check('a query of its own builds nothing',
        module.officialUrl(jsdelivr, '2.1.1?x=1'), null);
    check('no CDN, no address at all', module.officialUrl(null, newer), null);

    /* -- THE TWO WAYS OF DECLARING THE SETTINGS --------------------------
       00-preamble reads them from a tag, and from window.annotepageConfig when
       there is no tag to read. It touches no DOM either -- document.currentScript,
       document.baseURI and location.origin are all it asks for -- so it runs
       here against three plain objects, and the day it starts needing a real
       document this falls over, which is the point.

       WHAT IS PROVED HERE, because the whole subject is failures nobody can
       see: the tag behaves exactly as it did before this existed, the object
       works where a tag cannot, a missing address is REFUSED rather than
       guessed, two sources that contradict each other are refused rather than
       resolved, and the case with no source at all says one line and stands
       down. Every one of these was broken on purpose and watched to fail. */
    process.stdout.write('\nthe two ways of declaring the settings\n');

    const preamble = read('00-preamble.js');
    const SITE = 'https://site.example.com';
    const API = 'https://api.example.com/api.php';
    const ID = 'Up4tgMk-kJmJl1MUMuC5yA';        // the vector's own project id

    /* One evaluation of the section, with the three things it reads faked and
       the console captured: a warning is one of the behaviours under test, not
       noise to be silenced. `dataset` is passed as it is because that is what a
       browser hands over -- data-server becomes dataset.server. */
    const settingsOf = (page) => {
        const warnings = [];
        const win = { console: { warn: (line) => warnings.push(String(line)) } };
        if ('global' in page) win.annotepageConfig = page.global;
        const doc = {
            currentScript: 'src' in page ? { src: page.src, dataset: page.dataset || {} } : null,
            baseURI: SITE + '/guide/index.html'
        };
        const got = new Function('window', 'document', 'location', preamble
            + '\nreturn { API: API, PROJECT: PROJECT, DECLARED_KEY: DECLARED_KEY,'
            + ' DECLARED_PROJECT: DECLARED_PROJECT, KEY_DECLARED: KEY_DECLARED,'
            + ' SETUP_REQUESTED: SETUP_REQUESTED, MODE: MODE, PATH_PREFIX: PATH_PREFIX,'
            + ' DOMAINS: DOMAINS.join("|"), FAILURE: CONFIG_FAILURE };'
        )(win, doc, { origin: SITE });
        return { got: got, warnings: warnings };
    };
    /* What was refused, as one word: the label the screen will show, and the
       setting it names. "none" is a configuration that was adopted. */
    const refusal = (r) => {
        if (!r.got) return 'nothing was read at all';
        if (!r.got.FAILURE) return 'none';
        return r.got.FAILURE.label
            + (r.got.FAILURE.values ? ':' + r.got.FAILURE.values.name : '');
    };

    /* -- The tag, which must not have moved one inch ------------------- */
    const tagged = settingsOf({ src: SITE + '/js/annotepage.js',
        dataset: { server: API, project: ID } });
    check('a tag declares the address and the project', tagged.got.API + ' ' + tagged.got.PROJECT,
        API + ' ' + ID);
    check('and says nothing in the console', tagged.warnings.length, 0);
    check('a tag served by the site still falls back on ../api.php',
        settingsOf({ src: SITE + '/js/annotepage.js', dataset: {} }).got.API,
        SITE + '/api.php');
    check('a tag served by a CDN deduces no address',
        settingsOf({ src: 'https://cdn.jsdelivr.net/npm/annotepage-client@2/dist/annotepage.js',
            dataset: {} }).got.API, '');

    /* -- The object, where a tag cannot be read ------------------------ */
    const declared = settingsOf({ global: { server: API, project: ID } });
    check('the object declares the address and the project',
        declared.got.API + ' ' + declared.got.PROJECT, API + ' ' + ID);
    check('and says nothing in the console either', declared.warnings.length, 0);
    check('a path prefix, a mode and a list of origins are read the same way',
        (() => {
            const r = settingsOf({ global: { server: API, project: ID, mode: 'plain',
                path: '/fr/', domains: ['https://a.example.com', 'https://b.example.com'] } });
            return r.got.MODE + ' ' + r.got.PATH_PREFIX + ' ' + r.got.DOMAINS;
        })(), 'plain /fr/ https://a.example.com|https://b.example.com');
    check('setup is asked for with a value, not with presence',
        settingsOf({ global: { server: API, setup: true } }).got.SETUP_REQUESTED
            + ' ' + settingsOf({ global: { server: API, setup: false } }).got.SETUP_REQUESTED,
        'true false');

    /* -- The address is required, and never deduced -------------------- */
    const noServer = settingsOf({ global: { project: ID } });
    check('an object with no server is refused', refusal(noServer), 'tag.config_no_server');
    check('and nothing was adopted from it', noServer.got.API + '|' + noServer.got.PROJECT, '|');
    check('and it is said once, in the console', noServer.warnings.length, 1);

    /* -- The mode is the key, and its shape is judged elsewhere -------- */
    const keyed = settingsOf({ global: { server: API, key: VECTOR_SALT } });
    check('a key in the object is a key declared', keyed.got.KEY_DECLARED, true);
    check('and it is not turned into an id here', keyed.got.PROJECT, '');
    check('an empty key is still something somebody meant to write',
        settingsOf({ global: { server: API, key: '' } }).got.KEY_DECLARED, true);
    /* keyFromText() is the only judge of a key's shape (20-crypto), so a
       malformed one passes THROUGH this section untouched and is refused by
       90-boot with tag.key_shape, exactly as a malformed data-key is. A second
       judgement written here is a second judgement to keep in step. */
    check('a malformed key is not judged here', refusal(
        settingsOf({ global: { server: API, key: 'not-a-key' } })), 'none');
    /* Both together are carried through for the same reason: 90-boot derives
       the id from the key and compares, and refuses the pair that disagrees. */
    const both = settingsOf({ global: { server: API, key: VECTOR_SALT, project: ID } });
    check('a key and an id together are both carried through',
        (both.got.DECLARED_KEY === VECTOR_SALT) + ' ' + (both.got.DECLARED_PROJECT === ID),
        'true true');

    /* -- Two sources that say different things ------------------------- */
    const agreeing = settingsOf({ src: SITE + '/js/annotepage.js',
        dataset: { server: API, project: ID }, global: { server: API, project: ID } });
    check('an object repeating the tag exactly is not a disagreement',
        refusal(agreeing), 'none');
    check('and the tag is what configured it', agreeing.got.API, API);
    check('an object contradicting the tag is refused, by setting',
        refusal(settingsOf({ src: SITE + '/js/annotepage.js', dataset: { server: API, project: ID },
            global: { server: 'https://elsewhere.example.com/api.php', project: ID } })),
        'tag.two_sources:server');
    check('an object declaring what the tag does not is refused too',
        refusal(settingsOf({ src: SITE + '/js/annotepage.js', dataset: { server: API, project: ID },
            global: { path: '/fr/' } })), 'tag.two_sources:path');
    check('and nothing is adopted from either side',
        settingsOf({ src: SITE + '/js/annotepage.js', dataset: { server: API, project: ID },
            global: { path: '/fr/' } }).got.API, '');
    check('setup: false beside a tag that never asked for it is not a disagreement',
        refusal(settingsOf({ src: SITE + '/js/annotepage.js', dataset: { server: API, project: ID },
            global: { setup: false } })), 'none');

    /* -- What the object may not contain ------------------------------- */
    check('a setting this client does not have is refused, by name',
        refusal(settingsOf({ global: { server: API, serveur: API } })),
        'tag.config_setting:serveur');
    check('a setting that is not text is refused, by name',
        refusal(settingsOf({ global: { server: API, project: 42 } })),
        'tag.config_value:project');
    check('a list of origins holding something that is not text is refused',
        refusal(settingsOf({ global: { server: API, domains: ['https://a.example.com', 7] } })),
        'tag.config_value:domains');
    check('an object that is not an object is refused',
        refusal(settingsOf({ global: 'https://api.example.com/api.php' })), 'tag.config_shape');

    /* -- And the case this whole thing exists for ---------------------- */
    const nothing = settingsOf({});
    check('no tag and no object: the section stands down', refusal(nothing),
        'nothing was read at all');
    check('and leaves exactly one line behind', nothing.warnings.length, 1);
    check('which names the other way of declaring them',
        (nothing.warnings[0] || '').indexOf('annotepageConfig') !== -1, true);

    /* THE SETTINGS ARE DOCUMENTED WHERE THEY ARE COPIED FROM. The package's
       readme is the table people read before writing either form; a setting
       added to the client and not to it is a setting nobody can discover, and
       one removed from the client and left there is a line that does nothing.
       The same class of drift as every other duplication guarded here. */
    const quoted = ((preamble.match(/const SETTINGS = \[([\s\S]*?)\];/) || [])[1] || '')
        .match(/'([a-z]+)'/g) || [];
    const listed = quoted.map((q) => q.slice(1, -1));
    const readme = readFileSync(join(HERE, '..', 'README.md'), 'utf8');
    const documented = [...readme.matchAll(/^\|\s*`data-([a-z]+)`\s*\|/gm)].map((m) => m[1]);
    check('the client reads ten settings', listed.length, 10);
    check('and the readme documents those, and only those',
        listed.filter((s) => !documented.includes(s))
            .concat(documented.filter((s) => !listed.includes(s))).join(', ') || 'the same ten',
        'the same ten');

    /* -- THE SHIPPED TRANSLATION COVERS THE SHIPPED LABELS ---------------
       A missing label falls back on English, which is the right behaviour and
       the reason nobody ever noticed: a French panel with an English button
       looks like a choice. Measured before this check: fifteen were missing,
       including every label of the window that hands over the assistant's
       file. The package ships this file, so the package answers for it. */
    process.stdout.write('\nthe French set against the labels it translates\n');
    const labels = readFileSync(join(SRC, '15-labels.js'), 'utf8');
    const named = [...labels.matchAll(/^\s*'([a-z0-9_.]+)':/gm)].map((m) => m[1]);
    const french = JSON.parse(readFileSync(join(HERE, '..', 'labels', 'fr.json'), 'utf8'));
    const missing = named.filter((k) => !(k in french));
    const extra = Object.keys(french).filter((k) => !named.includes(k));
    check('every label has a French one', missing.length === 0 ? 'none missing' : missing.join(', '),
        'none missing');
    check('and none translates something that no longer exists',
        extra.length === 0 ? 'none left over' : extra.join(', '), 'none left over');

    /* AND THE SCRIPT A TAG LOADS SAYS WHAT THE JSON SAYS. labels/fr.js is
       generated from fr.json by the build; one edited by hand, or left behind
       by a build that was not run, would be a French set that differs
       depending on which file a site loads. */
    const { labelsScript } = await import('./labels-script.mjs');
    const frJs = join(HERE, '..', 'labels', 'fr.js');
    const shipped = existsSync(frJs) ? readFileSync(frJs, 'utf8') : '(missing)';
    check('labels/fr.js is what the build makes from labels/fr.json',
        shipped === labelsScript(french, 'fr') ? 'identical' : 'differs -- run npm run build',
        'identical');
    /* And it does what a tag needs: run it, and the labels are there, with
       one the page set itself kept over the French one. */
    const sandbox = { window: { Annotepage: { labels: { 'button.open': 'Page wins' } } } };
    new Function('window', shipped)(sandbox.window);
    check('loading labels/fr.js leaves the French set in window.Annotepage.labels',
        sandbox.window.Annotepage.labels['button.close'] === french['button.close']
            && sandbox.window.Annotepage.labels['button.open'] === 'Page wins'
            ? 'French set, page label kept' : JSON.stringify(sandbox.window.Annotepage.labels).slice(0, 80),
        'French set, page label kept');

    /* -- THE LANGUAGE THE PAGE ITSELF DECLARES ---------------------------
       The panel stayed English until somebody declared a file, and the reason
       written on the site was aimed at the wrong target: it argued against
       reading the BROWSER -- where two people at one screen would get two
       panels -- and applied that to the PAGE, which says one thing to
       everybody looking at it. The browser is still never consulted. The page
       now is, and data-labels stays the way to overrule it.

       Every check below was made to fail before it was kept. */
    process.stdout.write('\nthe language the page declares\n');

    page.lang = 'fr-CA';
    check('the language is read off <html>, in one place', module.pageLanguage(), 'fr-CA');
    page.lang = '  fr  ';
    check('and what surrounds it is not part of it', module.pageLanguage(), 'fr');
    page.lang = null;
    check('no lang attribute is no language', module.pageLanguage(), '');

    const CDN = 'https://cdn.jsdelivr.net/npm/annotepage-client@2/dist/annotepage.js';
    const FRENCH = 'https://cdn.jsdelivr.net/npm/annotepage-client@2/labels/fr.js';
    const OURS = 'https://site.example.com/labels/our-own.js';

    check('a French page loads the French set, from beside the client it already loaded',
        module.labelsFileFor('', CDN, 'fr'), FRENCH);
    check('fr-CA is French: the region says which French, and there is one',
        module.labelsFileFor('', CDN, 'fr-CA'), FRENCH);
    check('and the case it is written in decides nothing',
        module.labelsFileFor('', CDN, 'FR-ca'), FRENCH);

    /* NULL IS THE INTERESTING ANSWER IN THE NEXT FOUR: no address means no
       <script>, which means no request, which means no 404 in the console of
       every page of that site. A guess would cost every visitor one. */
    check('a language this package does not ship stays English, and asks for nothing',
        module.labelsFileFor('', CDN, 'de'), null);
    check('a page declaring no language stays English, and asks for nothing either',
        module.labelsFileFor('', CDN, ''), null);
    check('a copy served by the site deduces nothing: its neighbours are not ours to guess',
        module.labelsFileFor('', 'https://annotepage.com/annotepage-client-2.0.0.js', 'fr'), null);
    check('and a copy configured with no tag has no address to deduce one from',
        module.labelsFileFor('', '', 'fr'), null);

    check('the set comes from the exact version the tag pinned, never from one chosen here',
        module.labelsFileFor('',
            'https://cdn.jsdelivr.net/npm/annotepage-client@2.0.0/dist/annotepage.js', 'fr'),
        'https://cdn.jsdelivr.net/npm/annotepage-client@2.0.0/labels/fr.js');
    check('unpkg publishes the package the same way',
        module.labelsFileFor('', 'https://unpkg.com/annotepage-client@2/dist/annotepage.js', 'fr'),
        'https://unpkg.com/annotepage-client@2/labels/fr.js');

    check('a file declared on the tag wins over the language of the page',
        module.labelsFileFor(OURS, CDN, 'fr'), OURS);
    check('and wins on a page whose language ships nothing, which is how every other '
        + 'language arrives', module.labelsFileFor(OURS, CDN, 'de'), OURS);

    /* AND THE BOOT CALLS THAT RULE RATHER THAN REPEATING IT. Everything above
       exercises labelsFileFor; what 90-boot does with it cannot be run here,
       since that file is all DOM. So what can be checked from outside is: the
       call is there, and it is handed the three facts the rule needs. An
       inlined "LOCAL_LABELS_URL ||" back in the boot would be a second copy of
       the order, and a copy nobody runs is a copy that drifts -- the same
       failure this file guards between the settings and the readme. */
    const boot = read('90-boot.js');
    check('90-boot asks labelsFileFor which file to load, with the tag, the page and '
        + 'the language',
        /labelsFileFor\(LOCAL_LABELS_URL,\s*SCRIPT_SRC,\s*pageLanguage\(\)\)/.test(boot)
            ? 'it does' : (boot.match(/labels[A-Za-z]*\([^)]*\)?/) || ['no call at all'])[0],
        'it does');

    /* -- AND WHAT IS ON THE SCREEN WHEN NO FILE ARRIVES ------------------
       The rule of silence, checked where it shows: T(). A 404, a CDN that is
       down, a file that turns out not to be a label set -- none of them ever
       writes window.Annotepage.labels, and the panel opens in English rather
       than not at all. */
    check('with no label file, the panel is in English',
        module.T('button.open'), 'Annotate this page');
    window.Annotepage.labels = 'not a set of labels';
    check('a file that arrived and wrote something else leaves English in place',
        module.T('button.open'), 'Annotate this page');
    window.Annotepage.labels = null;
    new Function('window', shipped)(window);
    check('and the French set, once it has run, is what T() answers',
        module.T('button.open'), french['button.open']);

    process.stdout.write(failures ? '\n' + failures + ' failure(s)\n' : '\neverything conforms\n');
    process.exit(failures ? 1 : 0);
};

main().catch((e) => {
    process.stdout.write('error: ' + (e && e.stack ? e.stack : e) + '\n');
    process.exit(1);
});
