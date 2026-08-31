/* client-bridge.mjs — RUNS THE REAL CLIENT CODE UNDER NODE.
 *
 * This file reimplements NOTHING, and that is its whole point: the day
 * somebody copies an "equivalent" derivation in here to make life easier, the
 * test stops comparing two implementations and starts comparing itself with
 * itself — that is, protecting nothing at all.
 *
 * So it reads client/src/*.js AS THEY ARE and evaluates them in a sandbox
 * (node:vm) where we lay out what the browser provides and Node does not
 * provide under the same name: window, document, location, localStorage.
 *
 * WHY THE SOURCES AND NOT dist/annotepage.js: the built file is an anonymous
 * immediately-invoked function that exports nothing. Its crypto functions are
 * reachable from outside in no way whatsoever. The sections are concatenated
 * by tools/build.mjs into ONE single scope; we redo the same concatenation
 * here, with the same injected values (TOOL_VERSION, FORMAT, STYLES), for the
 * sections that carry the protocol. The text of the sections is not touched,
 * and nothing is added to it but a final expression — see EPILOGUE below.
 *
 * WHAT IS LOADED, AND WHY THAT SPLIT:
 *
 *   00-preamble   what the tag declares: project, mode, API address
 *   10-utils      base64url, utf8 — the bytes of the format
 *   15-labels     the texts, which the messages of 40 depend on
 *   20-crypto     the three derivations, the blind index, the envelope
 *   30-state      the salt, the keys, the index of the current page
 *   40-api        the five addresses, and above all THE BUILDING OF THE BODY
 *
 * Sections 50 to 90 are left out: they build an interface, they carry no
 * protocol decision, and loading them would need a real DOM. The consequence
 * has to be said plainly: this test exercises the client FROM "here are the
 * fields of a note", not from a click. What sits between the click and the
 * fields — reading the selector, the fingerprint and the excerpt — is not
 * covered here.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..');
const CLIENT_SRC = join(ROOT, 'client', 'src');

/* The same order as build.mjs. If the client ever moves a protocol function
   into another section, this array must follow — and the test will fail
   loudly in the meantime, which is the right way to fail: better a test that
   refuses to start than a test that checks half the client without saying
   so. */
const SECTIONS = [
    '00-preamble.js',
    '10-utils.js',
    '15-labels.js',
    '20-crypto.js',
    '30-state.js',
    '40-api.js',
];

/**
 * The ONLY line of code added to the client.
 *
 * The sections declare everything with block-scoped "const" and "let":
 * nothing becomes a property of the global object, so there is no way to
 * reach these functions from outside. This final expression brings them back
 * out — and, for "keys" and "PAGE_INDEX" which are "let" bindings the
 * interface normally sets at boot, it exposes the assignment rather than the
 * value: a function defined INSIDE the scope can write into those variables,
 * which an object of values could not.
 */
const EPILOGUE = `
({
    /* What the tag produced — we READ it back rather than assume it. */
    read: () => ({ API, PROJECT, MODE, SITE_VERSION, ENVIRONMENT,
                   PATH_PREFIX, PAGE_INDEX }),

    /* The boot (section 90, not loaded) does exactly this: it derives the
       keys from the salt, computes the index of the page, and sets them. */
    install: (newKeys, index) => { keys = newKeys; PAGE_INDEX = index; },

    /* The protocol, as the client writes it. */
    derive, indexOfPath, pagePath, seal, open,
    generateSalt, saltFromText, b64url, fromB64url, utf8, fromUtf8,

    /* The five addresses, as the client calls them. noteBody and
       resolutionBody are the sensitive point: that is where it is decided
       what goes out in the clear and what goes out in the envelope. */
    call, noteBody, resolutionBody, readList, openNote, openThread,
    skipped: () => skipped,

    inScope,
});
`;

/* What the browser provides and the built file gets for free. None of these
   values belongs to the protocol: they are the client's environment
   dependencies, and nothing else. */
const buildSandbox = (options) => {
    const memory = new Map();
    const localStorage = {
        getItem: (k) => (memory.has(k) ? memory.get(k) : null),
        setItem: (k, v) => { memory.set(k, String(v)); },
        removeItem: (k) => { memory.delete(k); },
    };

    const dataset = {};
    if (options.server) dataset.server = options.server;
    if (options.project) dataset.project = options.project;
    if (options.mode) dataset.mode = options.mode;
    if (options.version) dataset.version = options.version;
    if (options.environment) dataset.environment = options.environment;
    if (options.path_prefix) dataset.path = options.path_prefix;
    if (options.domains) dataset.domains = options.domains;

    const origin = options.origin || 'https://example.invalid';
    const document = {
        /* The client refuses to guess an API address: with no tag, it stands
           down in silence. So we give it one, exactly as an annotated page
           would. */
        currentScript: { src: origin + '/annotepage.js', dataset },
        baseURI: origin + '/',
        documentElement: { getAttribute: () => 'fr' },
        createElement: () => ({ style: {}, dataset: {}, setAttribute() {}, appendChild() {} }),
    };

    const win = {
        crypto: webcrypto,
        localStorage,
        document,
        innerWidth: 1280,
        innerHeight: 800,
        Annotepage: undefined,
    };
    win.window = win;

    const sandbox = {
        window: win,
        self: win,
        document,
        localStorage,
        crypto: webcrypto,
        /* location.pathname is READ by pagePath(). It stays writable so the
           test can play several pages without reloading the whole client. */
        location: { pathname: options.path || '/', origin, href: origin + (options.path || '/') },
        TextEncoder,
        TextDecoder,
        URL,
        URLSearchParams,
        btoa,
        atob,
        fetch,
        console,
        setTimeout,
        clearTimeout,
    };
    win.location = sandbox.location;
    return sandbox;
};

/** The format number as the client BUILD injects it. */
const clientFormat = () => {
    const build = readFileSync(join(ROOT, 'client', 'tools', 'build.mjs'), 'utf8');
    const found = /^const FORMAT = (\d+);$/m.exec(build);
    if (!found) {
        throw new Error(
            'The format number was not found in client/tools/build.mjs (line '
            + '"const FORMAT = <n>;"). The bridge cannot guess it, and must not: '
            + 'two places declaring the same number end up diverging.');
    }
    return Number(found[1]);
};

/**
 * Loads the real client and returns its protocol functions.
 *
 * @param {object} options  what the tag would declare, plus the path of the
 *                          current page.
 */
export const loadClient = (options = {}) => {
    const pkg = JSON.parse(
        readFileSync(join(ROOT, 'client', 'package.json'), 'utf8'));
    const format = clientFormat();
    const styles = readFileSync(join(CLIENT_SRC, 'styles.css'), 'utf8');

    const body = SECTIONS
        .map((name) => readFileSync(join(CLIENT_SRC, name), 'utf8'))
        .join('\n\n');

    /* All of it inside a function, as in the built file: section 00 ends with
       an early "return", which only makes sense there. */
    const program = [
        '(function () {',
        "'use strict';",
        'const TOOL_VERSION = ' + JSON.stringify(pkg.version) + ';',
        'const FORMAT = ' + format + ';',
        'const STYLES = ' + JSON.stringify(styles) + ';',
        body,
        /* trimStart() is not cosmetic: a "return" followed by a line break
           terminates itself and returns undefined. The bridge began its life
           that way, and the client looked as though it stood down at load
           time. */
        'return ' + EPILOGUE.trimStart(),
        '}())',
    ].join('\n');

    const sandbox = buildSandbox(options);
    const context = createContext(sandbox);
    const exported = runInContext(program, context,
        { filename: 'client/src (assembled by the bridge)' });

    if (!exported) {
        throw new Error(
            'The client stood down at load time: it found no usable tag. Check '
            + 'the options passed to loadClient().');
    }

    return Object.assign({ format, version: pkg.version, sandbox }, exported);
};
