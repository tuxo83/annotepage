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
    /* STRICT, BECAUSE THE BUNDLE IS (build.mjs). A Function body is sloppy
       unless told otherwise, and sloppy mode forgives what the served file
       throws on: an assignment to a frozen history went through here in
       silence while it stopped the tool from booting in a browser. */
    '\'use strict\';',
    read('10-utils.js'),
    /* 15-labels.js is data and nothing but data: the English set T() falls
       back on. It is loaded here so that the fallback can be PROVEN rather
       than described -- a label file that never arrives leaves exactly these
       words on the screen. */
    read('15-labels.js'),
    read('20-crypto.js'),
    /* 30-state.js for the zone (data-zone): which selector is one, and which
       element sits inside which. Its storage and its scope touch the window
       only inside functions, which are not called here. */
    read('30-state.js'),
    /* 80-upgrade.js joins them for the same reason: its decisions -- is that
       announced version newer, does it even look like a version, which
       address do we build from it, which label set ships beside this file --
       are pure, they touch no DOM, and they are the ones a hostile answer
       would try to bend. Everything in that file that touches the document is
       inside a function, so evaluating it here costs nothing. */
    read('80-upgrade.js'),
    /* 85-pages.js joins them too, for its decisions: what a change of address
       asks of a copy, who holds the document, and what listening does to the
       site's history object. They take the window and the document as
       parameters, so plain objects stand in for both. The slot's key is not
       written here a second time: it is READ OUT OF THE PREAMBLE, which is the
       one place that declares it, and a preamble that renamed it would make
       this assembly fail rather than check a key nobody uses. */
    (read('00-preamble.js').match(/^const INSTANCE_SLOT = .*;$/m) || ['/* no slot declared */'])[0],
    read('85-pages.js'),
    'return { b64url, fromB64url, generateSalt, keyFromText, derive,',
    '         indexOfPath, seal, open, compact, T, pageLanguage,',
    '         versionNumbers, announcedVersion, cdnServing, officialUrl,',
    '         shippedLabelsFor, shippedLabelsUrl, labelsFileFor,',
    '         pageStep, claimDocument, releaseDocument, listenForPages,',
    '         bootIsStale, reattachAllowed, REATTACH_LIMIT, CONTESTED_WITHIN,',
    '         INSTANCE_SLOT, selectorItems, zoneFrom, zoneHolding, pickVerdict,',
    '         outermostZones };'
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
        // A document another copy already runs in (00-preamble, 85-pages).
        if ('slot' in page) doc[Symbol.for('annotepage')] = page.slot;
        const got = new Function('window', 'document', 'location', '\'use strict\';\n' + preamble
            + '\nreturn { API: API, PROJECT: PROJECT, DECLARED_KEY: DECLARED_KEY,'
            + ' DECLARED_PROJECT: DECLARED_PROJECT, KEY_DECLARED: KEY_DECLARED,'
            + ' SETUP_REQUESTED: SETUP_REQUESTED, MODE: MODE, PATH_PREFIX: PATH_PREFIX,'
            + ' DOMAINS: DOMAINS.join("|"), FAILURE: CONFIG_FAILURE, IDENTITY: COPY_IDENTITY,'
            + ' ZONE_DECLARED: ZONE_DECLARED, ZONE_SELECTOR: ZONE_SELECTOR };'
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

    /* -- AND A SECOND COPY IN THE SAME DOCUMENT ------------------------
       One tool per page, by rule (00-preamble). A router re-executing the
       tag, or a template carrying the same line twice, is the SAME
       configuration: read nothing, say nothing, hand the question to the copy
       that runs. Another configuration on the same page does not start
       either, and it is the one of the two that has to be SAID: before this,
       a second project on one template never started and nothing anywhere
       told anybody. */
    const TAG = SITE + '/js/annotepage.js';
    const configured = (dataset, extra) => Object.assign({ src: TAG, dataset: dataset }, extra || {});
    const identityOf = (page) => settingsOf(page).got.IDENTITY;
    const OTHER_ID = 'AAAAAAAAAAAAAAAAAAAAAA';
    const X = configured({ server: API, project: ID, path: '/fr/' });
    const Y = configured({ server: API, project: OTHER_ID, path: '/en/' });
    let rechecked = 0;
    const holderX = () => ({ copy: { version: '0.0.0', identity: identityOf(X),
        recheck: () => { rechecked += 1; } }, listening: true });

    const slotX = holderX();
    const held = settingsOf(Object.assign({ slot: slotX }, X));
    check('the same configuration finding the document held stands down before reading a setting',
        refusal(held), 'nothing was read at all');
    check('and says nothing in the console, which a re-execution per click would repeat',
        held.warnings.length, 0);
    check('and asks the running copy to look at the page again, once', rechecked, 1);

    const secondTool = settingsOf(Object.assign({ slot: slotX }, Y));
    check('another project with another data-path on the same page does not start',
        refusal(secondTool), 'nothing was read at all');
    check('and says so, in one line', secondTool.warnings.length, 1);
    check('which names the rule and where it is explained',
        /one tool runs per page/.test(secondTool.warnings[0] || '')
            && /questions\.html#one-per-page/.test(secondTool.warnings[0] || ''), true);
    check('and it still tells the running copy the page may have changed', rechecked, 2);
    check('the same second tag executed again by a router says nothing more',
        settingsOf(Object.assign({ slot: slotX }, Y)).warnings.length, 0);

    check('the same settings from another file are another configuration',
        settingsOf(Object.assign({ slot: holderX() },
            configured({ server: API, project: ID, path: '/fr/' }, { src: SITE + '/js/other.js' })))
            .warnings.length, 1);
    /* It said 1 until the second review. data-version is a label for the
       notes, not a project: a body swapped after a deploy brings build-2 in the
       same tag, and warning about "several projects" there was false. The
       running copy keeps the version it booted with until a reload. */
    check('the same tag with another data-version, as a body swap brings after a deploy, is the same configuration',
        settingsOf(Object.assign({ slot: holderX() },
            configured({ server: API, project: ID, path: '/fr/', version: 'build-2' }))).warnings.length, 0);
    check('an attribute that is not a setting does not make another configuration',
        settingsOf(Object.assign({ slot: holderX() },
            configured({ server: API, project: ID, path: '/fr/', annotepageOn: 'yes' }))).warnings.length, 0);

    /* The preamble runs inside whatever executed the tag -- a router, mid
       navigation. A fault of the running copy must stay there. */
    const faulty = { copy: { version: '0.0.0', identity: identityOf(X),
        recheck: () => { throw new Error('a defect of the running copy'); } }, listening: true };
    let escaped = 'nothing escaped';
    try { settingsOf(Object.assign({ slot: faulty }, X)); } catch (e) { escaped = 'escaped: ' + e.message; }
    check('a running copy that throws when asked to look again does not throw into the router',
        escaped, 'nothing escaped');

    check('a document given back by a copy handing over boots the next one normally',
        refusal(settingsOf(Object.assign({ slot: { copy: null, listening: true, handedOver: [identityOf(X)] } },
            configured({ server: API, project: ID, path: '/fr/' }, { src: SITE + '/js/newer.js' })))), 'none');
    const oldTagAgain = settingsOf(Object.assign({ slot: { copy: null, listening: true,
        handedOver: [identityOf(X)] } }, X));
    check('while the old tag executed again after that hand-over stands down, in silence',
        refusal(oldTagAgain) + ', ' + oldTagAgain.warnings.length + ' warning(s)',
        'nothing was read at all, 0 warning(s)');

    /* TWO SPELLINGS OF ONE DECLARATION ARE ONE CONFIGURATION. Each of these
       printed the "another configuration" line at every navigation. */
    const heldBy = (page) => ({ copy: { version: '0.0.0', identity: identityOf(page),
        recheck: () => {} }, listening: true });
    const warningsBeside = (running, arriving) =>
        settingsOf(Object.assign({ slot: heldBy(running) }, arriving)).warnings.length;
    check('a cache-busting query on the file (?ver=) is the same file',
        warningsBeside(configured({ server: API, project: ID }, { src: TAG + '?ver=1694500000' }),
            configured({ server: API, project: ID }, { src: TAG + '?ver=1694500042' })), 0);
    check('while another project is still another configuration, whatever the query',
        warningsBeside(configured({ server: API, project: ID }, { src: TAG + '?ver=1' }),
            configured({ server: API, project: OTHER_ID }, { src: TAG + '?ver=1' })), 1);
    check('the object with its keys in another order is the same object',
        warningsBeside({ global: { server: API, project: ID, path: '/fr/' } },
            { global: { path: '/fr/', project: ID, server: API } }), 0);
    check('a list of origins spaced differently is the same list',
        warningsBeside(configured({ server: API, project: ID, domains: 'https://a.example.com,https://b.example.com' }),
            configured({ server: API, project: ID, domains: 'https://a.example.com, https://b.example.com' })), 0);

    const crowded = holderX();
    let spoken = 0;
    for (let i = 0; i < 30; i += 1) {
        spoken += settingsOf(Object.assign({ slot: crowded },
            configured({ server: API, project: ID, path: '/p' + i + '/' }))).warnings.length;
    }
    check('thirty different configurations after the first: one line for the whole document', spoken, 1);
    check('and the record of them stays bounded', crowded.refused.length, 8);

    /* THE IDENTITY IS TOTAL: whatever the page put in the object, the preamble
       does not throw, and two different objects are still two. */
    const bare = Object.create(null);
    Object.assign(bare, { server: API, project: ID, count: 10n });
    const trap = { server: API };
    Object.defineProperty(trap, 'project', { enumerable: true, get: () => { throw new Error('a getter of the page'); } });
    const thrownBy = (global) => {
        try {
            settingsOf({ slot: holderX(), global: global });
            return 'nothing thrown';
        } catch (e) {
            return e.constructor.name + ': ' + e.message;
        }
    };
    check('an object without a prototype holding a BigInt does not throw into the page', thrownBy(bare), 'nothing thrown');
    check('nor does a getter that throws', thrownBy(trap), 'nothing thrown');
    const looped = (project) => {
        const o = { server: API, project: project, extra: {} };
        o.extra.back = o;
        return o;
    };
    check('two objects with a loop in them are still told apart by what they declare',
        warningsBeside({ global: looped(ID) }, { global: looped(OTHER_ID) }), 1);
    check('and an object with a loop is the same as itself',
        warningsBeside({ global: looped(ID) }, { global: looped(ID) }), 0);

    /* AN IDENTITY THAT CANNOT BE READ IS UNKNOWN, NOT DIFFERENT. A copy of an
       earlier build holds the document with none, and the CDN serving the new
       release mid-visit re-executes the same tag under this code. */
    check('a running copy with no identity: the tag stands down in silence',
        settingsOf(Object.assign({ slot: { copy: { version: '2.29.0', recheck: () => {} }, listening: true } }, Y))
            .warnings.length, 0);
    check('a running copy whose identity is written in another format: silence too',
        settingsOf(Object.assign({ slot: { copy: { version: '9.0.0', identity: '["annotepage/identity/9"]',
            recheck: () => {} }, listening: true } }, Y)).warnings.length, 0);
    check('a hand-over recorded in another format: this tag may be that copy\'s, so silence',
        settingsOf(Object.assign({ slot: { copy: { version: '9.0.0', identity: identityOf(X), recheck: () => {} },
            listening: true, handedOver: ['an identity an older version wrote'] } }, Y)).warnings.length, 0);

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
    check('the client reads eleven settings', listed.length, 11);
    check('and the readme documents those, and only those',
        listed.filter((s) => !documented.includes(s))
            .concat(documented.filter((s) => !listed.includes(s))).join(', ') || 'the same eleven',
        'the same eleven');

    /* -- THE ZONE (data-zone) ----------------------------------------------
       Where a remark can be WRITTEN, never where one is read. What runs here
       is every decision the pick rests on; the browser half -- a real
       selector engine, real clicks, a zone rendered after a navigation -- is
       proved in a browser, and not pretended here.

       `compiles` stands in for the browser's parser: it refuses an item
       ending on a combinator, an unbalanced parenthesis and a "!", which is
       enough to prove what is done WITH a refusal. Whether a given string is
       CSS is the browser's to say, and nothing here second-guesses it. */
    process.stdout.write('\nthe zone a remark can be written in\n');

    check('the tag\'s data-zone is read, trimmed',
        (() => {
            const r = settingsOf(configured({ server: API, project: ID, zone: '  .article, main .content ' }));
            return r.got.ZONE_DECLARED + ' ' + r.got.ZONE_SELECTOR;
        })(), 'true .article, main .content');
    check('and zone in the object the same way',
        settingsOf({ global: { server: API, project: ID, zone: 'article' } }).got.ZONE_SELECTOR, 'article');
    check('an empty data-zone is still a zone somebody declared',
        settingsOf(configured({ server: API, project: ID, zone: '' })).got.ZONE_DECLARED, true);
    check('no data-zone is no zone', settingsOf(configured({ server: API, project: ID })).got.ZONE_DECLARED, false);
    check('a zone in the object that is not text is refused, by name',
        refusal(settingsOf({ global: { server: API, project: ID, zone: ['article'] } })), 'tag.config_value:zone');
    check('a tag and an object that disagree about the zone are refused like any other setting',
        refusal(settingsOf({ src: TAG, dataset: { server: API, project: ID, zone: 'article' },
            global: { server: API, project: ID, zone: 'main' } })), 'tag.two_sources:zone');

    check('the zone is part of what makes a configuration: the tag',
        identityOf(configured({ server: API, project: ID, zone: 'article' }))
            === identityOf(configured({ server: API, project: ID })) ? 'the same identity' : 'two identities',
        'two identities');
    check('another zone on the same page is another configuration, said once',
        warningsBeside(configured({ server: API, project: ID, zone: 'article' }),
            configured({ server: API, project: ID, zone: 'main' })), 1);
    check('the same zone executed again by a router is the same configuration',
        warningsBeside(configured({ server: API, project: ID, zone: 'article' }),
            configured({ server: API, project: ID, zone: ' article ' })), 0);
    check('and in the object',
        warningsBeside({ global: { server: API, project: ID, zone: 'article' } },
            { global: { server: API, project: ID, zone: 'main' } }), 1);
    /* One setting more is one member more in every identity, so the format
       moved. A copy of the release before, still holding the document when
       the CDN serves this one mid-visit, must read as unknown -- not as a
       second tool. */
    check('a running copy of the identity format before zone existed: the tag stands down in silence',
        settingsOf(Object.assign({ slot: { copy: { version: '2.30.0',
            identity: '["annotepage/identity/1","' + TAG + '",[],null]', recheck: () => {} },
            listening: true } }, configured({ server: API, project: ID }))).warnings.length, 0);

    const compiles = (s) => s !== '' && !/[>+~]\s*$/.test(s) && s.indexOf('!') === -1
        && s.split('(').length === s.split(')').length;
    check('a selector list is split on the commas between its items',
        module.selectorItems('.article, main .content').join(' | '), '.article | main .content');
    check('and not on a comma inside :is(), inside an attribute value, or escaped',
        module.selectorItems(':is(h1, h2) > a,[title="a,b"], .x\\,y').join(' | '),
        ':is(h1, h2) > a | [title="a,b"] | .x\\,y');
    check('an empty item is an item', module.selectorItems('.a,').join(' | '), '.a | ');

    const judged = (declared, text, judge) => {
        const z = module.zoneFrom(declared, text, judge || compiles);
        return (z.valid ? 'valid' : 'invalid') + ' ' + JSON.stringify(z.selector)
            + (z.valid ? '' : ' broken ' + JSON.stringify(z.broken));
    };
    check('no zone declared restricts nothing', module.zoneFrom(false, '', compiles).declared + ' '
        + module.zoneFrom(false, '', compiles).valid, 'false true');
    check('a valid list is kept as written, trimmed',
        judged(true, '  .article, main .content  '), 'valid ".article, main .content"');
    check('an empty zone is invalid, never the whole page', judged(true, '   '), 'invalid "" broken ""');
    check('a trailing comma is invalid', judged(true, '.article,'), 'invalid ".article," broken ""');
    check('the item the browser refuses is the one named',
        judged(true, '.article, main >'), 'invalid ".article, main >" broken "main >"');
    check('an unclosed :is( is refused whole, not split into two items that pass',
        judged(true, ':is(h1, h2'), 'invalid ":is(h1, h2" broken ":is(h1, h2"');
    check('a list whose items pass one by one is still asked about as a whole',
        judged(true, '.a, .b', (s) => s.indexOf(',') === -1), 'invalid ".a, .b" broken ".a, .b"');

    /* A page, as the walk sees it: parents and a matcher. Classes and tag
       names are all the fake matcher reads. */
    const node = (tag, classes, parent) => ({ nodeType: 1, tag: tag, classes: classes || [],
        parentElement: parent || null,
        matches(selector) {
            return selector.split(',').map((s) => s.trim()).some((s) => s === this.tag
                || (s[0] === '.' && this.classes.indexOf(s.slice(1)) !== -1));
        } });
    const html = node('html');
    const body = node('body', [], html);
    const header = node('header', [], body);
    const link = node('a', [], node('nav', [], header));
    const article = node('article', ['article'], body);
    const em = node('em', [], node('p', [], article));
    const aside = node('aside', ['article'], article);
    const span = node('span', [], aside);
    const footerText = node('p', [], node('footer', [], body));
    const ARTICLE = module.zoneFrom(true, '.article', compiles);

    check('the zone element itself is inside', module.zoneHolding(article, '.article') === article, true);
    check('and so is anything it contains', module.pickVerdict(ARTICLE, em), 'inside');
    check('a link in the header is outside', module.pickVerdict(ARTICLE, link), 'outside');
    check('the walk stops at the top of the document', module.zoneHolding(html, '.article'), null);
    check('in a nested zone, the nearest zone holds it', module.zoneHolding(span, '.article') === aside, true);
    check('and it is inside', module.pickVerdict(ARTICLE, span), 'inside');
    check('only the outermost zones are outlined',
        module.outermostZones([article, aside], '.article').map((e) => e.tag).join(','), 'article');
    check('a list of two selectors opens both',
        module.pickVerdict(module.zoneFrom(true, '.article, footer', compiles), footerText), 'inside');
    check('no zone: the header can be annotated as it always could', module.pickVerdict(
        module.zoneFrom(false, '', compiles), link), 'anywhere');
    check('an invalid zone opens nothing, not even the zone it meant',
        module.pickVerdict(module.zoneFrom(true, 'article >', compiles), em), 'nowhere');

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

    /* -- THE PAGE CHANGES, THE DOCUMENT DOES NOT ------------------------
       85-pages. The browser half -- a real router, a real body swap, notes
       from a real server -- cannot run here and is not pretended here. What
       can is every decision that half rests on, against plain objects. */
    process.stdout.write('\nthe page changes without a reload\n');

    const step = (s) => module.pageStep(Object.assign(
        { frozen: false, path: '/a', known: '/a', inScope: true, outOfScope: false, running: true }, s));
    check('the same path is the same page, whatever the body did', step({}), 'none');
    check('another path, for a running tool: its own notes', step({ path: '/b' }), 'follow');
    check('another path during a boot or a key screen: the boot looks again when it lands',
        step({ path: '/b', running: false }), 'wait');
    check('leaving the declared prefix takes the tool down',
        step({ path: '/elsewhere', inScope: false }), 'leave');
    check('moving about outside it only remembers the path',
        step({ path: '/elsewhere/2', inScope: false, outOfScope: true, running: false }), 'note');
    check('coming back into it boots, as a full load would',
        step({ path: '/b', outOfScope: true, running: false }), 'enter');
    check('a refused configuration or a copy that handed over never moves',
        step({ path: '/b', frozen: true }), 'none');

    /* A boot that lands after a newer one started, or with an index that is
       no longer the page's: the exit-and-return that opened page A's list
       with page B's index. */
    const stale = (s) => module.bootIsStale(Object.assign(
        { run: 1, current: 1, index: 'A', pageIndex: 'A' }, s));
    check('a boot landing on its own page and run is applied', stale({}), false);
    check('a boot overtaken by a newer one (out of the prefix and back) is dropped',
        stale({ current: 2 }), true);
    check('an answer asked with page A\'s index while the page is B is dropped',
        stale({ pageIndex: 'B' }), true);
    check('and one asked while the next index is still being computed too',
        stale({ pageIndex: '' }), true);
    check('a step taken before there is an index is judged on the run alone',
        stale({ index: undefined, pageIndex: '' }), false);

    /* The host put back against a site that removes it on purpose. */
    const pingPong = { at: -Infinity, contested: 0 };
    let granted = 0;
    for (let i = 0; i < module.REATTACH_LIMIT + 5; i += 1) if (module.reattachAllowed(pingPong, 1000)) granted += 1;
    check('a host removed again at once is put back up to the limit, and not once more',
        granted, module.REATTACH_LIMIT);
    check('a removal later than CONTESTED_WITHIN starts the count again',
        module.reattachAllowed(pingPong, 1000 + module.CONTESTED_WITHIN), true);
    const cachedVisits = { at: -Infinity, contested: 0 };
    let visitsGranted = 0;
    for (let i = 0, t = 0; i < 20; i += 1, t += 170) {
        // Turbo on a cached page: the preview, then the response 20 ms later.
        if (module.reattachAllowed(cachedVisits, t)) visitsGranted += 1;
        if (module.reattachAllowed(cachedVisits, t + 20)) visitsGranted += 1;
    }
    check('twenty cached Turbo visits, two swaps each, in under four seconds: every one put back',
        visitsGranted, 40);

    /* -- THE BOOT, RUN RATHER THAN READ --------------------------------
       90-boot is all DOM, so this used to count staleBoot( in its source. A
       count passes on a check moved to the wrong line. Here the real 30-state,
       80-upgrade, 85-pages and 90-boot run together, the network, the crypto
       and the drawing replaced by promises the test lands by hand, and each
       guard is proven by what happens without it: every check below was made
       to fail by deleting the line it is about, on a copy. */
    const flush = () => new Promise((resolve) => setImmediate(resolve));
    const outcome = (promise) => {
        const seen = { state: 'pending' };
        Promise.resolve(promise).then(() => { seen.state = 'resolved'; },
            (e) => { seen.state = 'rejected: ' + (e && e.message); });
        return seen;
    };
    const bootHarness = (options) => {
        const h = Object.assign({ pending: {}, log: [], warnings: [], elements: [], clock: 0,
            path: '/a', pathReads: 0, onDraw: null }, options || {});
        h.wait = (name) => new Promise((resolve) => { (h.pending[name] = h.pending[name] || []).push(resolve); });
        h.land = (name, value) => {
            const resolve = (h.pending[name] || []).shift();
            if (!resolve) throw new Error('nothing is waiting for ' + name);
            resolve(value);
        };
        h.waiting = (name) => (h.pending[name] || []).length;
        h.element = (tag) => {
            const e = { tag: tag, isConnected: false, listeners: {}, attributes: [],
                setAttribute(name, value) { this.attributes.push({ name: name, value: value }); },
                addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
                fire(type) { (this.listeners[type] || []).forEach((fn) => fn()); },
                remove() { this.isConnected = false; } };
            h.elements.push(e);
            return e;
        };
        const doc = { body: null, documentElement: { getAttribute: () => null },
            querySelectorAll: () => [], createElement: (tag) => h.element(tag),
            head: { appendChild: (n) => { h.log.push('injected ' + n.src); } },
            addEventListener: () => {} };
        const win = { crypto: webcrypto, addEventListener: () => {},
            navigation: { addEventListener: () => {} } };
        const stubs = `
            const INSTANCE_SLOT = Symbol.for('annotepage');
            const CONFIG_FAILURE = null;
            const SCRIPT_SRC = h.src || '';
            const script = { attributes: [{ name: 'data-key', value: 'k' }] };
            const LOCAL_LABELS_URL = h.labels || null;
            let PROJECT = '';
            let PUBLIC_KEY = false;
            const DECLARED_KEY = '', DECLARED_PROJECT = '', KEY_DECLARED = false, SETUP_REQUESTED = false;
            const DOMAINS = [];
            const PATH_PREFIX = h.prefix || '';
            const COPY_IDENTITY = 'harness';
            const complain = (line) => { h.warnings.push(line); };
            const CRYPTO = {};
            const keyFromText = () => new Uint8Array(32);
            const derive = () => h.wait('derive');
            const pagePath = () => { h.pathReads += 1; return h.path; };
            const indexOfPath = () => h.wait('index');
            const call = (action) => h.wait('call:' + action);
            const failureFrom = () => ({ title: 'title', detail: 'detail' });
            const readTotals = () => null, readRetention = () => 0, readExpired = () => null,
                readServerTotals = () => null;
            const readList = () => h.wait('decrypt');
            const anchor = () => {}, drawMarkers = () => {}, closePop = () => {}, closeForm = () => {},
                hideHighlight = () => {};
            const drawPanel = () => { const once = h.onDraw; h.onDraw = null; if (once) once(); };
            const leaveMode = () => { mode = false; };
            const buildHost = () => {
                if (host) return;
                host = h.element('annotepage-notes');
                document.body.appendChild(host);
                watchHost();
                root = { appendChild: (n) => { h.log.push('into the shadow root: ' + n.tag); } };
            };
            // As 60-ui's does: the first thing it does is root.appendChild.
            const buildUi = () => { root.appendChild(h.element('div')); ui = {}; h.log.push('buildUi'); };
            const clearLayer = () => { if (root) ui = null; };
            const openTagScreen = () => {}, openSaltScreen = () => {}, openSetupScreen = () => {},
                openContextScreen = () => {};
        `;
        const run = new Function('window', 'document', 'h', 'Date', 'FORMAT', 'TOOL_VERSION', 'SITE_VERSION',
            ['\'use strict\';', stubs, read('10-utils.js'), read('30-state.js'), read('80-upgrade.js'),
                read('85-pages.js'), read('90-boot.js'),
                'return (expression) => eval(expression);'].join('\n'))(
            win, doc, h, { now: () => h.clock }, FORMAT, TOOL_VERSION, '');
        // The boot waits for DOMContentLoaded while there is no body; the
        // checks call what they need themselves.
        doc.body = { appendChild: (n) => { n.isConnected = true; } };
        return { h: h, run: run, fn: (name) => run(name) };
    };
    const FAILED = { ok: false, cause: 'server' };

    {
        const b = bootHarness();
        b.fn('startWithSalt')('key', { indexKey: 1 });
        b.fn('stepAside')();
        b.h.land('index', 'I');
        await flush();
        check('startWithSalt: leaving while the index is computed stops the boot before it asks for the list',
            b.h.waiting('call:list') + ' ' + JSON.stringify(b.run('PAGE_INDEX')), '0 ""');
    }
    {
        const b = bootHarness();
        b.fn('startWithSalt')('key', { indexKey: 1 });
        b.h.land('index', 'I');
        await flush();
        b.fn('stepAside')();
        b.run('outOfScope = false; PAGE_INDEX = "I"');
        b.fn('buildHost')();
        b.h.land('call:list', { ok: false, cause: 'network' });
        await flush();
        check('startWithSalt: a silence landing for a boot overtaken by a newer one leaves the newer tool alone',
            b.run('host') !== null, true);
    }
    {
        const b = bootHarness();
        b.run('PAGE_INDEX = "I"; bootRun = 2');
        b.fn('proceed')(FAILED, 1, 'I');
        await flush();
        check('proceed: an overtaken boot builds nothing', b.run('host'), null);
    }
    {
        const b = bootHarness({ labels: 'https://site.example.com/labels/fr.js' });
        b.run('PAGE_INDEX = "I"');
        const boot = outcome(b.fn('proceed')(FAILED, b.run('bootRun'), 'I'));
        const labelFile = b.h.elements.filter((e) => e.tag === 'script').pop();
        b.fn('stepAside')();
        labelFile.fire('load');
        await flush();
        check('proceed: leaving while the labels load, the interface is not built into a dropped root',
            boot.state + (b.h.log.includes('buildUi') ? ', built' : ''), 'resolved');
    }
    {
        const b = bootHarness();
        b.run('PAGE_INDEX = "I"');
        b.fn('proceed')({ ok: true, data: {} }, b.run('bootRun'), 'I');
        await flush();
        b.fn('stepAside')();
        b.h.land('decrypt', [{ id: 'a note of the page that left' }]);
        await flush();
        check('proceed: notes decrypted for a page that left are not kept', b.run('notes.length'), 0);
    }
    {
        const b = bootHarness();
        b.run('PAGE_INDEX = "I"');
        b.h.onDraw = () => b.fn('stepAside')();
        b.h.pathReads = 0;
        b.fn('proceed')(FAILED, b.run('bootRun'), 'I');
        await flush();
        check('proceed: a boot overtaken while it draws does not go on to follow the address',
            b.h.pathReads, 0);
    }
    for (const exitMeanwhile of [false, true]) {
        const b = bootHarness({ src: 'https://cdn.jsdelivr.net/npm/annotepage-client@2/dist/annotepage.js' });
        b.fn('startWithSalt')('key', { indexKey: 1 });
        b.h.land('index', 'I');
        await flush();
        b.h.land('call:list', { ok: true, data: { client_version: newer } });
        await flush();
        const injected = b.h.elements.filter((e) => e.tag === 'script').pop();
        if (exitMeanwhile) b.fn('stepAside')();
        if (injected) injected.fire('error');
        await flush();
        check(exitMeanwhile
            ? 'a hand-over that fails after the reader left proceeds under its own run, and builds nothing'
            : 'a hand-over that fails proceeds, and the tool is built',
        (injected ? 'handed over, ' : 'no hand-over, ') + (b.h.log.includes('buildUi') ? 'built' : 'not built'),
        exitMeanwhile ? 'handed over, not built' : 'handed over, built');
    }
    {
        const b = bootHarness({ prefix: '/elsewhere/' });
        const before = b.run('bootRun');
        b.fn('start')();
        const afterStart = b.run('bootRun');
        b.fn('stepAside')();
        check('start() and stepAside() each raise the run', (afterStart - before) + ' ' + (b.run('bootRun') - afterStart),
            '1 1');
    }

    /* keepHostAttached, against the two sites the second review described. */
    {
        const b = bootHarness({ labels: 'https://cdn.jsdelivr.net/npm/annotepage-client@2/labels/fr.js' });
        b.run('PAGE_INDEX = "I"');
        const boot = outcome(b.fn('proceed')(FAILED, b.run('bootRun'), 'I'));
        const labelFile = b.h.elements.filter((e) => e.tag === 'script').pop();
        let putBack = 0;
        for (let i = 0; i < 30 && b.run('host'); i += 1) {
            b.run('host').isConnected = false;           // the site's observer, at once
            b.fn('keepHostAttached')();
            if (b.run('host') && b.run('host').isConnected) putBack += 1;
        }
        labelFile.fire('load');
        await flush();
        check('a site removing the host at once, on a French page: put back ' + module.REATTACH_LIMIT
            + ' times, withdrawn, one line, and the boot landing after it throws nothing',
        putBack + ' put back, ' + (b.run('host') ? 'still there' : 'withdrawn') + ', ' + b.h.warnings.length
            + ' line, boot ' + boot.state + (b.h.log.includes('buildUi') ? ', built' : ''),
        module.REATTACH_LIMIT + ' put back, withdrawn, 1 line, boot resolved');
    }
    {
        const b = bootHarness();
        b.fn('buildHost')();
        for (let i = 0; i < 10 && b.run('host'); i += 1) {
            b.run('host').isConnected = false;           // the preview
            b.fn('keepHostAttached')();
            if (!b.run('host')) break;
            b.h.clock += 20;
            b.run('host').isConnected = false;           // the response
            b.fn('keepHostAttached')();
            b.h.clock += 150;
        }
        check('ten cached Turbo visits in under two seconds: the host is still there, and nothing said',
            (b.run('host') && b.run('host').isConnected ? 'there' : 'gone') + ', ' + b.h.warnings.length + ' line',
            'there, 0 line');
    }

    process.stdout.write('one copy per document\n');
    const documentA = {};
    const copyOne = { version: '1.0.0', identity: 'one', recheck: () => {} };
    const copyTwo = { version: '1.0.0', identity: 'two', recheck: () => {} };
    check('the first copy takes the document', module.claimDocument(documentA, copyOne), true);
    check('a second copy does not', module.claimDocument(documentA, copyTwo), false);
    check('and the first still holds it', documentA[module.INSTANCE_SLOT].copy === copyOne, true);
    check('claiming again is not a conflict with oneself', module.claimDocument(documentA, copyOne), true);
    module.releaseDocument(documentA, copyTwo);
    check('a copy that does not hold it cannot give it back', documentA[module.INSTANCE_SLOT].copy === copyOne, true);
    module.releaseDocument(documentA, copyOne);
    check('the holder handing over leaves its configuration on record, for its tag executed again',
        (documentA[module.INSTANCE_SLOT].handedOver || []).join(','), 'one');
    check('the holder handing over frees it for the newer copy',
        module.claimDocument(documentA, copyTwo), true);
    check('the slot is the preamble\'s own key, a registered symbol',
        module.INSTANCE_SLOT === Symbol.for('annotepage'), true);

    /* A site's history object and window, reduced to what listening touches.
       `path` stands in for location.pathname, which the real pushState
       changes before it returns. */
    const fakeSite = (withNavigation) => {
        const listeners = {};
        const history = {
            path: '/a',
            pushed: [],
            pushState(state, title, url) {
                if (url === 'refused') throw new Error('the site\'s own refusal');
                this.pushed.push(url);
                this.path = url;
                return 'what the site returns';
            },
            replaceState(state, title, url) { this.path = url; return 'replaced'; }
        };
        const win = {
            history: history,
            addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
            fire: (type) => (listeners[type] || []).forEach((fn) => fn()),
            listeners: listeners
        };
        if (withNavigation) {
            win.navigation = { addEventListener: (type, fn) => win.addEventListener('nav:' + type, fn) };
        }
        return win;
    };

    const site = fakeSite(false);
    const doc = {};
    const seen = [];
    const holder = { version: '1.0.0', recheck: () => seen.push(site.history.path) };
    module.claimDocument(doc, holder);
    const originalPush = site.history.pushState;
    check('without the Navigation API, listening installs itself', module.listenForPages(site, doc), true);
    check('pushState still returns what the site returns',
        site.history.pushState({ s: 1 }, '', '/b'), 'what the site returns');
    check('with the arguments it was given and on the object it belongs to',
        site.history.pushed.join(','), '/b');
    check('and the copy looks AFTER the address changed, never before', seen.join(','), '/b');
    site.history.replaceState(null, '', '/c');
    check('replaceState is heard the same way', seen.join(','), '/b,/c');
    site.fire('popstate');
    check('and so is the back button', seen.length, 3);

    const wrapped = site.history.pushState;
    check('a second copy listening installs nothing', module.listenForPages(site, doc), false);
    check('so history is wrapped once, not once per copy', site.history.pushState === wrapped, true);
    site.history.pushState(null, '', '/d');
    check('and one navigation is announced once', seen.length, 4);
    check('the wrapper is not the site\'s method: it was wrapped at all',
        wrapped !== originalPush, true);

    let refused = 'nothing thrown';
    try { site.history.pushState(null, '', 'refused'); } catch (e) { refused = e.message; }
    check('a URL the site\'s history refuses throws to the site, as it did',
        refused, 'the site\'s own refusal');
    check('and a navigation that did not happen is not followed', seen.length, 4);

    holder.recheck = () => { throw new Error('a defect of ours'); };
    let broke = 'the site\'s navigation went through';
    try { site.history.pushState(null, '', '/e'); } catch (e) { broke = 'the site saw: ' + e.message; }
    check('a defect in the copy never breaks the site\'s navigation', broke,
        'the site\'s navigation went through');

    const newerCopy = { version: '9.0.0', recheck: () => seen.push('newer ' + site.history.path) };
    module.releaseDocument(doc, holder);
    module.claimDocument(doc, newerCopy);
    site.history.pushState(null, '', '/f');
    check('after a handover the listeners already there speak to the newer copy',
        seen[seen.length - 1], 'newer /f');
    module.releaseDocument(doc, newerCopy);
    check('and with nobody holding the document, the site navigates undisturbed',
        site.history.pushState(null, '', '/g'), 'what the site returns');

    const modern = fakeSite(true);
    const modernDoc = {};
    let heard = 0;
    module.claimDocument(modernDoc, { version: '1.0.0', recheck: () => { heard += 1; } });
    const untouched = modern.history.pushState;
    module.listenForPages(modern, modernDoc);
    check('with the Navigation API, history is left exactly as the site has it',
        modern.history.pushState === untouched, true);
    check('and the change of entry is what is listened to',
        (modern.listeners['nav:currententrychange'] || []).length, 1);
    modern.fire('nav:currententrychange');
    modern.fire('popstate');
    check('both signs reach the copy', heard, 2);

    /* A history the site froze, without the Navigation API: the assignment
       throws in strict mode, and it used to throw before the boot. */
    const frozenHistory = Object.freeze({
        pushState() { return 'the site\'s own push'; },
        replaceState() { return 'the site\'s own replace'; }
    });
    const hardened = fakeSite(false);
    hardened.history = Object.create(frozenHistory);
    const hardenedDoc = {};
    let hardenedHeard = 0;
    module.claimDocument(hardenedDoc, { version: '1.0.0', identity: 'h', recheck: () => { hardenedHeard += 1; } });
    let thrown = 'nothing thrown';
    try { module.listenForPages(hardened, hardenedDoc); } catch (e) { thrown = e.constructor.name + ': ' + e.message; }
    check('listening on a frozen History does not throw, so the boot still runs', thrown, 'nothing thrown');
    check('and the site\'s methods are left as it froze them',
        hardened.history.pushState === frozenHistory.pushState
            && hardened.history.pushState(null, '', '/x') === 'the site\'s own push', true);
    hardened.fire('popstate');
    check('and the back button is still heard', hardenedHeard, 1);

    process.stdout.write(failures ? '\n' + failures + ' failure(s)\n' : '\neverything conforms\n');
    process.exit(failures ? 1 : 0);
};

main().catch((e) => {
    process.stdout.write('error: ' + (e && e.stack ? e.stack : e) + '\n');
    process.exit(1);
});
