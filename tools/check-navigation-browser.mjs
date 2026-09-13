#!/usr/bin/env node
/* check-navigation-browser.mjs -- ONE TOOL PER PAGE, IN A REAL BROWSER, ACROSS
   EVERY WAY A SITE CHANGES PAGE WITHOUT RELOADING.

   What it measures is what nothing else here can: pushState and popstate with
   and without the Navigation API, a Turbo-style body swap with the tag in the
   body and in the head, a prefix left and entered again, the tag included
   twice, two tags for two projects on one template, a frozen
   History.prototype, a list request still on the network when the page
   changes, and a site that removes every body child it does not know.
   `npm run check` runs the client's sections in Node, where no document
   navigates and no observer fights back. This proof lived outside the
   repository and ran when somebody remembered; it is here so that the release
   tool and CI run it instead.

   Against a real relay, not a fake: a throwaway copy of server/webroot/,
   installed with sqlite behind php's development server, and notes sealed by
   the client's own crypto sections. A change to the wire on either side shows
   up here as a page with no note.

       npm run check:browser                       builds the working tree to a temp file
       node tools/check-navigation-browser.mjs <bundle> [label]

   NOT IN `npm run check`, on purpose. It needs a browser and puppeteer, and
   the suite runs with Node alone -- on a fork's pull request, on a machine
   with nothing installed. Chained there, it would either fail wherever it
   cannot run or skip there, and a check that skips green reads as a pass. It
   runs on its own instead: tools/release.mjs refuses a client release without
   it, and .github/workflows/browser.yml runs it on every push to main and
   next.

   PUPPETEER IS NOT A DEPENDENCY and must not become one. This repository has
   none, by rule, and a browser driver is the heaviest supply chain there is.
   It is looked for, in order, from the directory named by
   ANNOTEPAGE_PUPPETEER, then by a plain import. Where neither finds it, this
   refuses to run and says how to provide it: it never reports a pass it did
   not measure.

   Exit status: 0 every scenario passed, 1 one failed, 2 it could not run.
*/

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtempSync, cpSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const cannotRun = (lines) => {
    console.error('check-navigation-browser: cannot run -- ' + lines.join('\n  '));
    process.exit(2);
};

/* ---- 0. what it needs, before anything is built or started ---- */

const firstLine = (e) => String((e && e.message) || e).split('\n')[0];
const loadPuppeteer = async () => {
    const notes = [];
    const dir = process.env.ANNOTEPAGE_PUPPETEER;
    if (dir) {
        try {
            /* Resolved as Node would from inside that directory, so the variable
               may name the directory puppeteer was installed into or the package
               directory itself: both are what people paste. */
            const entry = createRequire(join(resolve(dir), 'resolve-from-here.js')).resolve('puppeteer');
            return await import(pathToFileURL(entry).href);
        } catch (e) {
            notes.push('ANNOTEPAGE_PUPPETEER=' + dir + ' does not lead to puppeteer: ' + firstLine(e));
        }
    }
    try {
        const found = await import('puppeteer');
        /* Said, because a variable that points nowhere is a mistake somebody
           will want to fix even when another copy happened to be found. */
        for (const note of notes) console.error('note: ' + note + '; using the one a plain import found');
        return found;
    } catch (e) {
        notes.push('a plain import does not find it either: ' + firstLine(e));
    }
    cannotRun(['puppeteer was not found.', ...notes, '',
        'It is not a dependency of this repository, which has none by rule. Install it',
        'in a directory OUTSIDE the repository and point at that directory:',
        '',
        '    mkdir -p /path/to/puppeteer && npm install --prefix /path/to/puppeteer puppeteer',
        '    ANNOTEPAGE_PUPPETEER=/path/to/puppeteer npm run check:browser']);
};
const puppeteerModule = await loadPuppeteer();
const puppeteer = puppeteerModule.default || puppeteerModule;

/* A REFUSAL, where check-install.mjs and its neighbours skip with exit 0. They
   are links of `npm run check`, which has to pass on a machine without php.
   This one is asked for by name, and a release waits on its answer: "nothing
   was run" would be read as "nothing failed". */
const phpVersion = spawnSync('php', ['-r', 'echo PHP_VERSION;'], { encoding: 'utf8' });
if (phpVersion.error || phpVersion.status !== 0) {
    cannotRun(['no php on this machine. The proof runs a real relay behind php\'s development server.']);
}
/* The extensions the relay's own diagnostic asks for (api.php: json, mbstring,
   filter), plus the one its sqlite store asks for. */
const RELAY_EXTENSIONS = ['pdo_sqlite', 'mbstring', 'json', 'filter'];
const missing = RELAY_EXTENSIONS.filter((ext) => (spawnSync('php',
    ['-r', 'echo extension_loaded("' + ext + '") ? "yes" : "no";'], { encoding: 'utf8' }).stdout || '').trim() !== 'yes');
if (missing.length) {
    cannotRun(['php ' + phpVersion.stdout.trim() + ' lacks the extension(s) the relay needs: ' + missing.join(', ') + '.']);
}

/* ---- 0b. the bundle: given, or built from the working tree into the temp directory ---- */

const dir = mkdtempSync(join(tmpdir(), 'annotepage-navigation-'));
let php = null;
/* On every way out, a failed scenario and a crash included: a php server left
   listening and a temp copy of the relay are what the next run trips on. */
process.on('exit', () => {
    if (php) php.kill('SIGKILL');
    rmSync(dir, { recursive: true, force: true });
});

let BUNDLE = process.argv[2] ? resolve(process.argv[2]) : null;
const LABEL = process.argv[3] || (BUNDLE ? 'bundle' : 'working tree');
if (!BUNDLE) {
    /* Built to the temp directory with --out, never into client/dist/: the
       other checks read that file, and a proof must not change what they
       measure. */
    BUNDLE = join(dir, 'annotepage.js');
    const build = spawnSync(process.execPath, [join(ROOT, 'client', 'tools', 'build.mjs'), '--out', BUNDLE], { encoding: 'utf8' });
    if (build.status !== 0) {
        console.error('the build failed:\n' + (build.stderr || build.stdout || firstLine(build.error)));
        process.exit(1);
    }
}
const bundleText = readFileSync(BUNDLE, 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const freePort = () => new Promise((resolvePort) => {
    const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolvePort(port)); });
});

// ---- 1. local relay, sqlite, plain http allowed ----
const API_PORT = await freePort();
const PAGES_PORT = await freePort();
const web = join(dir, 'web');
cpSync(join(ROOT, 'server', 'webroot'), web, { recursive: true });
/* More than one worker: the installer requests its own address to prove the
   data file is out of reach, and a single worker busy serving it cannot
   answer. */
php = spawn('php', ['-S', '127.0.0.1:' + API_PORT], { cwd: web, env: { ...process.env, PHP_CLI_SERVER_WORKERS: '4' }, stdio: 'ignore' });
php.on('error', (e) => cannotRun(['php\'s development server did not start: ' + firstLine(e)]));
let serverUp = false;
for (let i = 0; i < 40 && !serverUp; i += 1) {
    await sleep(150);
    try { const r = await fetch('http://127.0.0.1:' + API_PORT + '/install.php', { redirect: 'manual' }); await r.arrayBuffer(); serverUp = true; } catch (e) { /* not yet */ }
}
/* It used to go on regardless, and every scenario then failed on a relay that
   was never there -- fifty failures that all said the same wrong thing. */
if (!serverUp) cannotRun(['php\'s development server did not answer on port ' + API_PORT + ' within 6 s.']);
const inst = spawnSync('php', [join(web, 'install.php'), '--api-address=http://127.0.0.1:' + API_PORT + '/api.php',
    '--answers-for=anyone', '--storage=sqlite', '--updated-by=cron', '--allow-plain-http=true'], { cwd: web, encoding: 'utf8' });
if (inst.status !== 0) { console.log('install failed', inst.stdout, inst.stderr); process.exit(1); }
const API = 'http://127.0.0.1:' + API_PORT + '/api.php';
const ORIGIN = 'http://127.0.0.1:' + PAGES_PORT;

// ---- 2. notes, encrypted by the client's own sections ----
const src = (n) => readFileSync(join(ROOT, 'client', 'src', n), 'utf8');
const lib = new Function('window', 'document', 'FORMAT', 'TOOL_VERSION', 'SITE_VERSION',
    [src('10-utils.js'), src('15-labels.js'), src('20-crypto.js'), 'return { b64url, derive, indexOfPath, seal };'].join('\n'))(
    { crypto: webcrypto }, { documentElement: { getAttribute: () => null } }, 2, '0.0.0', '');
const keyBytes = new Uint8Array(32); for (let i = 0; i < 32; i += 1) keyBytes[i] = (i * 37 + 11) % 256;
const KEY = lib.b64url(keyBytes);
const keys = await lib.derive(keyBytes);
const HEADINGS = {
    '/spa/a': 'Heading of page A', '/spa/b': 'Heading of page B',
    '/turbo/one': 'Heading of turbo one', '/turbo/two': 'Heading of turbo two',
    '/head/one': 'Heading of head one', '/head/two': 'Heading of head two',
    '/double/x': 'Heading of the double page',
    '/scoped/a': 'Heading of scoped A', '/scoped/b': 'Heading of scoped B',
    '/two/fr/x': 'Heading of two fr', '/two/en/x': 'Heading of two en',
    '/boot/in/a': 'Heading of boot A', '/boot/in/b': 'Heading of boot B',
    '/hostile/x': 'Heading of hostile',
    '/bust/one': 'Heading of bust one', '/bust/two': 'Heading of bust two',
    '/deploy/one': 'Heading of deploy one', '/deploy/two': 'Heading of deploy two',
    '/french/x': 'Titre de la page hostile',
};
const indexOf = {};
const seed = async (k, path, excerpt, label, fingerprint) => {
    const index = await lib.indexOfPath(k.indexKey, path);
    indexOf[index] = label;
    const payload = await lib.seal(k.encryptionKey, k.id, index, 'note',
        { page: path, selector: '', fingerprint: fingerprint || 'h1', excerpt, author: 'tester', text: 'note written on ' + path });
    const r = await fetch(API + '?action=add', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ project: k.id, mode: 'encrypted', index, payload }).toString() });
    const t = await r.text();
    if (r.status !== 200) { console.log('seed failed', path, r.status, t.slice(0, 200)); process.exit(1); }
};
for (const [path, heading] of Object.entries(HEADINGS)) await seed(keys, path, heading, path);
// A second project, Y, declared by a second tag on the /two/ template.
const keyBytes2 = new Uint8Array(32); for (let i = 0; i < 32; i += 1) keyBytes2[i] = (i * 53 + 7) % 256;
const KEY2 = lib.b64url(keyBytes2);
const keys2 = await lib.derive(keyBytes2);
for (const path of ['/two/fr/x', '/two/en/x']) await seed(keys2, path, 'Note of project Y', 'Y:' + path);
// data-zone="article": a note written in the footer before the zone existed.
const FOOTER_TEXT = 'Footer text of the zone page';
// The fingerprint is the element's real one (tag and id): 'p' alone ties with the article's bare paragraphs.
await seed(keys, '/zone/a', FOOTER_TEXT, '/zone/a', 'p#foot-text');

// ---- 3. fake pages ----
const tag = (extra) => `<script src="/annotepage.js${extra || ''}" data-server="${API}" data-key="${KEY}"></script>`;
const spaPage = (base, pathAttr) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>spa</title>
<script src="/annotepage.js" data-server="${API}" data-key="${KEY}"${pathAttr ? ' data-path="' + pathAttr + '"' : ''} defer></script></head><body>
<nav><a href="${base}/a" data-link="a">A</a> <a href="${base}/b" data-link="b">B</a></nav><main id="app"></main>
<script>
const HEADINGS = ${JSON.stringify(HEADINGS)};
function render() { document.getElementById('app').innerHTML = '<h1>' + HEADINGS[location.pathname] + '</h1><p>Body text of ' + location.pathname + '</p>'; }
window.rerender = function () { render(); };
document.addEventListener('click', function (e) {
  const a = e.target.closest('a[data-link]'); if (!a) return;
  e.preventDefault(); history.pushState({}, '', a.getAttribute('href')); render();
});
window.addEventListener('popstate', render);
render();
</script></body></html>`;
// Turbo imitation: pushState, snapshot by cloneNode, body replaced, body scripts re-activated
const fakeTurbo = `<script>
(function () {
  const cache = {};
  function activate(body) {
    body.querySelectorAll('script').forEach(function (old) {
      const s = document.createElement('script');
      for (const a of old.attributes) s.setAttribute(a.name, a.value);
      s.textContent = old.textContent;
      old.replaceWith(s);
    });
  }
  function swap(newBody) { document.body.replaceWith(newBody); activate(document.body); }
  document.addEventListener('click', function (e) {
    const a = e.target.closest && e.target.closest('a[data-turbo]'); if (!a) return;
    e.preventDefault();
    const href = a.getAttribute('href');
    cache[location.pathname] = document.body.cloneNode(true);
    history.pushState({ turbo: true }, '', href);
    fetch(href).then(function (r) { return r.text(); }).then(function (html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      swap(document.adoptNode(doc.body));
      window.turboSwaps = (window.turboSwaps || 0) + 1;
    });
  });
  window.addEventListener('popstate', function () {
    const snap = cache[location.pathname]; if (!snap) return;
    cache[location.pathname] = null;
    swap(snap.cloneNode(true));
    window.turboRestores = (window.turboRestores || 0) + 1;
  });
})();
</script>`;
const turboPage = (path, where) => {
    const base = where === 'body' ? '/turbo' : '/head';
    const other = path === base + '/one' ? base + '/two' : base + '/one';
    const headTag = where === 'head' ? tag('?head') : '';
    const bodyTag = where === 'body' ? tag('?body') : '';
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${path}</title>${fakeTurbo}${headTag}</head>
<body><nav><a href="${other}" data-turbo>go to ${other}</a></nav><main><h1>${HEADINGS[path]}</h1><p>Server-rendered ${path}</p></main>${bodyTag}</body></html>`;
};
// The same line twice: the same configuration. A different src is another configuration (see /two/).
const doublePage = () => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>double</title>${tag('')}</head>
<body><main><h1>${HEADINGS['/double/x']}</h1></main>${tag('')}</body></html>`;
// One template, two projects: X on /two/fr/, Y on /two/en/. X's tag comes first.
const twoPage = (path) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>two</title>
<script src="/annotepage.js" data-server="${API}" data-key="${KEY}" data-path="/two/fr/" defer></script>
<script src="/annotepage.js" data-server="${API}" data-key="${KEY2}" data-path="/two/en/" defer></script></head>
<body><main><h1>${HEADINGS[path]}</h1></main></body></html>`;
// A site that removes every body child it does not know, as soon as it appears.
const hostilePage = () => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>hostile</title>${tag('').replace('></script>', ' defer></script>')}</head>
<body><main><h1>${HEADINGS['/hostile/x']}</h1></main><script>
const known = new Set(document.body.children);
window.removals = 0;
new MutationObserver(function (records) {
  for (const r of records) for (const n of r.addedNodes) {
    if (n.nodeType === 1 && n.parentNode === document.body && !known.has(n) && n.tagName !== 'SCRIPT') { n.remove(); window.removals += 1; }
  }
}).observe(document.body, { childList: true });
</script></body></html>`;

// A Turbo-style page whose body tag is given whole: a cache-busting query, or a data-version.
const turboWith = (path, base, bodyTag) => {
    const other = path === base + '/one' ? base + '/two' : base + '/one';
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${path}</title>${fakeTurbo}</head>
<body><nav><a href="${other}" data-turbo>go to ${other}</a></nav><main><h1>${HEADINGS[path]}</h1><p>Server-rendered ${path}</p></main>${bodyTag}</body></html>`;
};
let bustCounter = 0;
const bustTag = () => `<script src="/annotepage.js?ver=${Date.now()}${(bustCounter += 1)}" data-server="${API}" data-key="${KEY}"></script>`;
const deployTag = (path) => `<script src="/annotepage.js" data-server="${API}" data-key="${KEY}" data-version="${path.endsWith('/one') ? 'build-1' : 'build-2'}"></script>`;
// A French page, the client from the CDN (labels fetched beside it), and the hostile observer.
// Both CDN addresses are answered by request interception below: nothing leaves the machine.
const CDN_BUNDLE = 'https://cdn.jsdelivr.net/npm/annotepage-client@2/dist/annotepage.js';
const CDN_LABELS = 'https://cdn.jsdelivr.net/npm/annotepage-client@2/labels/fr.js';
const frenchHostilePage = () => hostilePage()
    .replace('<html lang="en">', '<html lang="fr">')
    .replace('src="/annotepage.js"', 'src="' + CDN_BUNDLE + '"')
    .replace(HEADINGS['/hostile/x'], HEADINGS['/french/x']);
// data-zone: header / nav / article / footer, and a zone the router renders on page B only.
const zonePage = (zone) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>zone</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;color:#222} header,footer{background:#eef1f6;padding:14px 28px}
nav a{margin-right:14px} article{margin:28px;padding:8px 20px;max-width:620px} h2{margin:.4em 0}</style>
<script src="/annotepage.js" data-server="${API}" data-key="${KEY}" data-zone="${zone}" defer></script></head><body>
<header><nav><a href="/elsewhere" id="head-link">Home</a> <a href="/elsewhere">About</a></nav><p id="head-text">Header text of the zone page</p></header>
<article><h2 id="art-title">Article title of the zone page</h2><p id="art-text">Article text of the zone page, where remarks are welcome.</p>
<p>A second paragraph of the article, also open to remarks.</p></article>
<footer><p id="foot-text">${FOOTER_TEXT}</p></footer></body></html>`;
const zoneSpaPage = () => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>zone spa</title>
<script src="/annotepage.js" data-server="${API}" data-key="${KEY}" data-zone=".late" defer></script></head><body>
<main id="app"></main><script>
function render() { document.getElementById('app').innerHTML = location.pathname === '/zonespa/b'
  ? '<h1>Page B</h1><section class="late"><p id="late-text">Late zone text rendered by the router</p></section>'
  : '<h1>Page A</h1><p id="a-text">Page A has no zone at all</p>'; }
window.go = function (p) { history.pushState({}, '', p); render(); };
render();
</script></body></html>`;

let bundleHits = 0;
const pages = createServer((req, res) => {
    const url = new URL(req.url, ORIGIN);
    if (url.pathname === '/annotepage.js') { bundleHits += 1; res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); return res.end(bundleText); }
    if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    let html = null;
    if (url.pathname.startsWith('/spa/')) html = spaPage('/spa', '');
    else if (url.pathname.startsWith('/scoped/')) html = spaPage('/scoped', '/scoped/a');
    else if (url.pathname.startsWith('/turbo/')) html = turboPage(url.pathname, 'body');
    else if (url.pathname.startsWith('/head/')) html = turboPage(url.pathname, 'head');
    else if (url.pathname === '/double/x') html = doublePage();
    else if (url.pathname.startsWith('/two/')) html = twoPage(url.pathname);
    else if (url.pathname.startsWith('/boot/')) html = spaPage('/boot/in', '/boot/in/');
    else if (url.pathname === '/hostile/x') html = hostilePage();
    else if (url.pathname.startsWith('/bust/')) html = turboWith(url.pathname, '/bust', bustTag());
    else if (url.pathname.startsWith('/deploy/')) html = turboWith(url.pathname, '/deploy', deployTag(url.pathname));
    else if (url.pathname === '/french/x') html = frenchHostilePage();
    else if (url.pathname === '/zone/a') html = zonePage('article');
    else if (url.pathname === '/zone/none') html = zonePage('.nothing-here');
    else if (url.pathname === '/zone/bad') html = zonePage('article >');
    else if (url.pathname.startsWith('/zonespa/')) html = zoneSpaPage();
    if (!html) { res.writeHead(404); return res.end('no'); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html);
});
await new Promise((r) => pages.listen(PAGES_PORT, '127.0.0.1', r));

// ---- 4. measurements ----
/* --no-sandbox: Ubuntu 24.04, the CI image, forbids the unprivileged user
   namespaces Chrome's sandbox is built on. The pages are our own, on loopback. */
const launch = () => puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
let browser;
try {
    browser = await launch();
} catch (e) {
    cannotRun(['puppeteer is there but could not start a browser: ' + firstLine(e),
        'Its own Chrome is fetched by `npx puppeteer browsers install chrome`, run where it was',
        'installed; or name one already on the machine with PUPPETEER_EXECUTABLE_PATH.']);
}
const results = [];
const measure = (page) => page.evaluate(() => {
    const all = [...document.querySelectorAll('annotepage-notes')];
    const tools = all.filter((h) => h.shadowRoot);
    const rows = [];
    let buttons = 0, markers = 0, panelOpen = 0;
    for (const h of tools) {
        buttons += h.shadowRoot.querySelectorAll('.ap-button').length;
        markers += h.shadowRoot.querySelectorAll('.ap-marker').length;
        panelOpen += h.shadowRoot.querySelectorAll('.ap-panel.ap-open').length;
        h.shadowRoot.querySelectorAll('.ap-row-about').forEach((e) => rows.push(e.textContent));
    }
    return { path: location.pathname, elements: all.length, tools: tools.length, connected: tools.filter((h) => h.isConnected).length,
        buttons, rows: rows.join(' | '), markers, panelOpen, pushWrapped: !/native code/.test(String(history.pushState)) };
});
const until = async (page, ok, ms = 6000) => {
    const t0 = Date.now(); let last = null;
    while (Date.now() - t0 < ms) { last = await measure(page); if (ok(last)) return last; await sleep(100); }
    return last;
};
const record = (name, state, pass, detail) => {
    results.push({ name, pass });
    console.log((pass ? '  ok   ' : '  FAIL ') + name + '\n        ' + JSON.stringify(state) + (detail ? '\n        ' + detail : ''));
};
const one = (s) => s && s.elements === 1 && s.tools === 1 && s.connected === 1 && s.buttons === 1;
const openPage = async (noNavigationApi, inBrowser) => {
    const page = await (inBrowser || browser).newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const lists = [];
    const errors = [];
    page.on('request', (r) => { const u = new URL(r.url()); if (u.searchParams.get('action') === 'list') lists.push(indexOf[u.searchParams.get('index')] || u.searchParams.get('index')); });
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    page.on('response', (r) => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
    page.on('console', (m) => {
        if (m.type() !== 'error' && m.type() !== 'warn' && m.type() !== 'warning') return;
        // A failed resource is reported with its URL by the response listener above.
        if (/^Failed to load resource/.test(m.text())) return;
        errors.push(m.text());
    });
    if (noNavigationApi) await page.evaluateOnNewDocument(() => { Object.defineProperty(window, 'navigation', { value: undefined, configurable: true }); });
    return { page, lists, errors };
};
const clickTool = (page) => page.evaluate(() => {
    const live = [...document.querySelectorAll('annotepage-notes')].filter((h) => h.shadowRoot && h.isConnected)[0];
    live.shadowRoot.querySelector('.ap-button').click();
});

console.log('\n=== ' + LABEL + ' : ' + BUNDLE);

for (const variant of [false, true]) {
    const tagv = variant ? ' [no Navigation API: history wrapped]' : ' [Navigation API]';
    const { page, lists, errors } = await openPage(variant);
    await page.goto(ORIGIN + '/spa/a');
    let s = await until(page, (x) => x.rows === 'Heading of page A');
    record('pushState: first page A shows its own note' + tagv, s, one(s) && s.rows === 'Heading of page A');
    await page.click('a[data-link=b]');
    s = await until(page, (x) => x.path === '/spa/b' && x.rows === 'Heading of page B');
    record('pushState: page B shows only its own note' + tagv, s, one(s) && s.rows === 'Heading of page B' && s.pushWrapped === variant,
        'list requests: ' + lists.join(', '));
    const before = lists.length;
    await page.evaluate(() => window.rerender());
    await sleep(800);
    s = await measure(page);
    record('same URL, content re-rendered: same page, no new request' + tagv, s,
        one(s) && s.rows === 'Heading of page B' && lists.length === before, 'list requests after: ' + (lists.length - before));
    await page.goBack();
    s = await until(page, (x) => x.path === '/spa/a' && x.rows === 'Heading of page A');
    record('popstate back to A: only A\'s note' + tagv, s, one(s) && s.rows === 'Heading of page A');
    await page.goForward();
    s = await until(page, (x) => x.path === '/spa/b' && x.rows === 'Heading of page B');
    await clickTool(page);
    s = await until(page, (x) => x.panelOpen === 1 && x.markers === 1);
    record('annotation mode on B: panel open, one badge' + tagv, s, one(s) && s.markers === 1 && s.panelOpen === 1);
    await page.goBack();
    s = await until(page, (x) => x.path === '/spa/a' && x.rows === 'Heading of page A' && x.markers === 1);
    record('Back while the panel is open: panel stays open, lists A, badge on A' + tagv, s,
        one(s) && s.rows === 'Heading of page A' && s.panelOpen === 1 && s.markers === 1);
    await page.evaluate(() => window.rerender());
    await sleep(1200);
    s = await measure(page);
    record('re-render in annotation mode, same URL: note stays anchored' + tagv, s, one(s) && s.rows === 'Heading of page A' && s.markers === 1);
    record('no page error or console warning' + tagv, errors, errors.length === 0);
    await page.close();
}

for (const where of ['body', 'head']) {
    const base = where === 'body' ? '/turbo' : '/head';
    const n1 = base + '/one', n2 = base + '/two';
    const label = where === 'body' ? 'Turbo-style, tag in <body> re-executed' : 'Turbo-style, tag in <head> not re-executed';
    const { page, lists, errors } = await openPage(false);
    bundleHits = 0;
    await page.goto(ORIGIN + n1);
    let s = await until(page, (x) => x.rows === HEADINGS[n1]);
    record(label + ': first page', s, one(s) && s.rows === HEADINGS[n1]);
    await page.click('a[data-turbo]');
    s = await until(page, (x) => x.path === n2 && x.rows === HEADINGS[n2] && x.connected === 1);
    await sleep(600);
    s = await measure(page);
    const swaps = await page.evaluate(() => window.turboSwaps || 0);
    record(label + ': body replaced, second page shows only its note, one tool', s, swaps === 1 && one(s) && s.rows === HEADINGS[n2],
        'swaps=' + swaps + ', bundle fetched ' + bundleHits + ' times; list requests: ' + lists.join(', '));
    await page.goBack();
    s = await until(page, (x) => x.path === n1 && x.rows === HEADINGS[n1] && x.elements === 1);
    await sleep(600);
    s = await measure(page);
    const restores = await page.evaluate(() => window.turboRestores || 0);
    record(label + ': Back restores the cached clone, first page note, one element (clone swept)', s,
        restores === 1 && one(s) && s.rows === HEADINGS[n1], 'restores=' + restores + ', bundle fetched ' + bundleHits + ' times; list requests: ' + lists.join(', '));
    await clickTool(page).catch(() => {});
    s = await until(page, (x) => x.markers === 1);
    record(label + ': annotation mode after the swaps anchors on the live body', s, one(s) && s.markers === 1 && s.panelOpen === 1);
    record(label + ': no page error or console warning', errors, errors.length === 0);
    await page.close();
}

{
    // data-path="/scoped/a": B is outside the declared prefix
    const { page, lists, errors } = await openPage(false);
    await page.goto(ORIGIN + '/scoped/a');
    let s = await until(page, (x) => x.rows === HEADINGS['/scoped/a']);
    record('prefix: first page inside it shows its note', s, one(s) && s.rows === HEADINGS['/scoped/a']);
    await page.click('a[data-link=b]');
    s = await until(page, (x) => x.path === '/scoped/b' && x.elements === 0);
    await sleep(600);
    s = await measure(page);
    record('prefix: pushState out of it, the tool leaves the page entirely', s, s.path === '/scoped/b' && s.elements === 0,
        'list requests: ' + lists.join(', '));
    await page.goBack();
    s = await until(page, (x) => x.path === '/scoped/a' && x.rows === HEADINGS['/scoped/a']);
    record('prefix: Back into it, the tool returns with its note, key not asked again', s, one(s) && s.rows === HEADINGS['/scoped/a'],
        'list requests: ' + lists.join(', '));
    record('prefix: no page error or console warning', errors, errors.length === 0);
    await page.close();
}

{
    const { page, lists, errors } = await openPage(false);
    bundleHits = 0;
    await page.goto(ORIGIN + '/double/x');
    await sleep(2500);
    const s = await measure(page);
    record('tag included twice: one tool, the note listed once', s, one(s) && s.rows === HEADINGS['/double/x'],
        'bundle fetched ' + bundleHits + ' times; list requests: ' + lists.length);
    record('tag included twice: no page error or console warning', errors, errors.length === 0);
    await page.close();
}

{
    // Two tags, two projects, one template: one tool per page, by rule, and it is said once.
    for (const [path, expectRows, expectTools] of [['/two/fr/x', HEADINGS['/two/fr/x'], 1], ['/two/en/x', '', 0]]) {
        const { page, lists, errors } = await openPage(false);
        await page.goto(ORIGIN + path);
        await sleep(2500);
        const s = await measure(page);
        const warned = errors.filter((e) => /one tool runs per page/.test(e) && /#one-per-page/.test(e));
        const shape = expectTools === 1 ? one(s) && s.rows === expectRows : s.elements === 0;
        record('two tags, two configurations on ' + path + ': ' + (expectTools === 1
            ? 'exactly one tool, the first tag\'s project' : 'the first tag owns the page even out of its prefix: no tool, no takeover'),
        s, shape && lists.every((l) => !String(l).startsWith('Y:')), 'list requests: ' + lists.join(', '));
        record('two tags on ' + path + ': exactly one console warning, naming the rule', errors,
            warned.length === 1 && errors.length === 1);
        await page.close();
    }
}

{
    // A frozen History.prototype and no Navigation API: the tool boots, the site navigates.
    const { page, errors } = await openPage(true);
    await page.evaluateOnNewDocument(() => { Object.freeze(History.prototype); });
    await page.goto(ORIGIN + '/spa/a');
    const s = await until(page, (x) => x.rows === 'Heading of page A');
    record('frozen History.prototype: the tool still boots with A\'s note', s, one(s) && s.rows === 'Heading of page A' && !s.pushWrapped);
    await page.click('a[data-link=b]');
    await sleep(500);
    const heading = await page.evaluate(() => location.pathname + ' ' + document.querySelector('h1').textContent);
    record('frozen History.prototype: the site\'s own navigation goes through', heading, heading === '/spa/b Heading of page B');
    record('frozen History.prototype: no page error or console warning', errors, errors.length === 0);
    await page.close();
}

{
    // Out of the prefix and back in while the first boot's list is still on the network.
    const { page, lists, errors } = await openPage(false);
    await page.setRequestInterception(true);
    let delayed = false;
    page.on('request', (r) => {
        const u = new URL(r.url());
        if (u.searchParams.get('action') === 'list' && !delayed) { delayed = true; setTimeout(() => r.continue().catch(() => {}), 3000); return; }
        r.continue().catch(() => {});
    });
    await page.goto(ORIGIN + '/boot/in/a');
    await until(page, () => lists.length >= 1, 5000);
    await page.evaluate(async () => {
        history.pushState({}, '', '/boot/out');
        await new Promise((r) => setTimeout(r, 200));
        history.pushState({}, '', '/boot/in/b');
        window.rerender();
    });
    await sleep(4500);
    const s = await measure(page);
    const unreadable = await page.evaluate(() => [...document.querySelectorAll('annotepage-notes')]
        .some((h) => h.shadowRoot && /unreadable/i.test(h.shadowRoot.textContent)));
    record('prefix exit and return during the boot: B\'s note only, the stale list of A dropped', s,
        one(s) && s.path === '/boot/in/b' && s.rows === 'Heading of boot B' && !unreadable,
        'unreadable shown: ' + unreadable + '; list requests: ' + lists.join(', '));
    record('prefix exit and return during the boot: no page error or console warning', errors, errors.length === 0);
    await page.close();
}

{
    // Turbo visiting cached pages: preview swap, response swap 20 ms later (tag re-executed), next visit 150 ms after.
    const { page, errors } = await openPage(false);
    await page.goto(ORIGIN + '/turbo/one');
    let s = await until(page, (x) => x.rows === HEADINGS['/turbo/one']);
    const elapsed = await page.evaluate(async () => {
        const html = {};
        for (const p of ['/turbo/one', '/turbo/two']) html[p] = await (await fetch(p)).text();
        const bodyOf = (p) => document.adoptNode(new DOMParser().parseFromString(html[p], 'text/html').body);
        const activate = () => document.body.querySelectorAll('script').forEach((old) => {
            const n = document.createElement('script');
            for (const a of old.attributes) n.setAttribute(a.name, a.value);
            n.textContent = old.textContent;
            old.replaceWith(n);
        });
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const t0 = performance.now();
        for (let i = 0; i < 10; i += 1) {
            const target = i % 2 === 0 ? '/turbo/two' : '/turbo/one';
            history.pushState({}, '', target);
            document.body.replaceWith(bodyOf(target));
            await wait(20);
            document.body.replaceWith(bodyOf(target));
            activate();
            await wait(150);
        }
        return Math.round(performance.now() - t0);
    });
    s = await until(page, (x) => one(x) && x.rows === HEADINGS['/turbo/one'], 5000);
    await sleep(800);
    s = await measure(page);
    record('ten cached Turbo visits (two swaps each) in ' + elapsed + ' ms: the tool is still there, with the last page\'s note', s,
        elapsed < 2000 && one(s) && s.rows === HEADINGS['/turbo/one']);
    record('ten cached Turbo visits: no page error or console warning', errors, errors.length === 0);
    await page.close();
}

for (const [base, label] of [['/bust', 'cache-busting ?ver= on the re-executed tag'], ['/deploy', 'data-version build-1 then build-2 on the swapped body']]) {
    const { page, errors } = await openPage(false);
    await page.goto(ORIGIN + base + '/one');
    let s = await until(page, (x) => x.rows === HEADINGS[base + '/one']);
    await page.click('a[data-turbo]');
    s = await until(page, (x) => x.path === base + '/two' && x.rows === HEADINGS[base + '/two'] && x.connected === 1);
    await sleep(1200);
    s = await measure(page);
    record(label + ': one tool, the second page\'s note', s, one(s) && s.rows === HEADINGS[base + '/two']);
    record(label + ': no warning', errors, errors.length === 0);
    await page.close();
}

// ---- data-zone ----
const zoneState = (page) => page.evaluate(() => {
    const h = [...document.querySelectorAll('annotepage-notes')].find((x) => x.shadowRoot && x.isConnected);
    if (!h) return null;
    const r = h.shadowRoot;
    const notice = r.querySelector('.ap-zone-notice');
    const hl = r.querySelector('.ap-highlight');
    const instr = r.querySelector('.ap-panel-instructions div');
    return { path: location.pathname, frames: r.querySelectorAll('.ap-zone').length,
        formOpen: !!r.querySelector('.ap-form.ap-open'),
        notice: notice && notice.style.display === 'block' ? notice.textContent : '',
        highlight: !!hl && hl.style.display === 'block',
        rows: [...r.querySelectorAll('.ap-row-about')].map((e) => e.textContent).join(' | '),
        markers: r.querySelectorAll('.ap-marker').length, instructions: instr ? instr.textContent : '' };
});
const untilZone = async (page, ok, ms = 4000) => {
    const t0 = Date.now(); let last = null;
    while (Date.now() - t0 < ms) { last = await zoneState(page); if (last && ok(last)) return last; await sleep(100); }
    return last;
};
const OUTSIDE = 'Remarks go in the outlined areas of this page.';
const NONE = 'No part of this page is open to remarks.';

{
    const { page, errors } = await openPage(false);
    await page.goto(ORIGIN + '/zone/a');
    const s = await until(page, (x) => x.rows === FOOTER_TEXT);
    record('zone "article": the tool boots, the footer note is listed', s, one(s) && s.rows === FOOTER_TEXT);
    await clickTool(page);
    let z = await untilZone(page, (x) => x.frames === 1 && x.markers === 1);
    record('zone "article": annotation mode outlines one zone, the instruction names it, the footer badge is drawn', z,
        z && z.frames === 1 && z.markers === 1 && /outlined areas/.test(z.instructions));
    await page.hover('#head-text');
    await sleep(200);
    const hoverOut = await zoneState(page);
    await page.hover('#art-text');
    await sleep(200);
    const hoverIn = await zoneState(page);
    record('zone "article": hovering the header highlights nothing, hovering the article does', { out: hoverOut.highlight, in: hoverIn.highlight },
        hoverOut.highlight === false && hoverIn.highlight === true);
    await page.click('#head-link');
    await sleep(250);
    z = await zoneState(page);
    record('zone "article": a click in the header creates nothing, shows the message, does not follow the link', z,
        z.formOpen === false && z.notice === OUTSIDE && z.path === '/zone/a');
    await page.click('#art-text');
    z = await untilZone(page, (x) => x.formOpen, 2000);
    record('zone "article": a click in the article opens the note form, and the message goes', z, z.formOpen === true && z.notice === '');
    await page.keyboard.press('Escape');
    z = await zoneState(page);
    const badgeOnFooter = await page.evaluate(() => {
        const h = [...document.querySelectorAll('annotepage-notes')].find((x) => x.shadowRoot && x.isConnected);
        const m = h.shadowRoot.querySelector('.ap-marker');
        const f = document.getElementById('foot-text').getBoundingClientRect();
        return !!m && Math.abs(parseFloat(m.style.top) - (f.top - 8)) < 2 && Math.abs(parseFloat(m.style.left) - (f.left - 8)) < 2;
    });
    record('zone "article": the footer note is still listed, and its badge sits on the footer paragraph', { z, badgeOnFooter },
        z.rows === FOOTER_TEXT && z.markers === 1 && badgeOnFooter);
    record('zone "article": no page error or console warning', errors, errors.length === 0);
    await page.close();
}

for (const [path, pattern, label] of [['/zone/none', /matches nothing on this page/, 'zone matching nothing'],
    ['/zone/bad', /not a valid CSS selector list: "article >" does not parse/, 'invalid zone "article >"']]) {
    const { page, errors } = await openPage(false);
    await page.goto(ORIGIN + path);
    const s = await until(page, (x) => one(x));
    await clickTool(page);
    await sleep(500);
    await page.click('#art-text');
    await sleep(250);
    const z = await zoneState(page);
    record(label + ': nothing can be annotated, not even the article, and the click says so', { s, z },
        one(s) && z.formOpen === false && z.frames === 0 && z.notice === NONE);
    await page.hover('#art-text');
    await sleep(150);
    const lit = (await zoneState(page)).highlight;
    record(label + ': no highlight anywhere', lit, lit === false);
    record(label + ': exactly one console line, saying why', errors, errors.length === 1 && pattern.test(errors[0]));
    await page.close();
}

{
    const { page, errors } = await openPage(false);
    await page.goto(ORIGIN + '/zonespa/a');
    const s = await until(page, (x) => one(x));
    await clickTool(page);
    await sleep(400);
    await page.click('#a-text');
    await sleep(250);
    let z = await zoneState(page);
    record('zone rendered later: on page A, with no zone yet, nothing opens', { s, z }, one(s) && z.formOpen === false && z.notice === NONE);
    await page.evaluate(() => window.go('/zonespa/b'));
    z = await untilZone(page, (x) => x.path === '/zonespa/b' && x.frames === 1, 3000);
    record('zone rendered later: after a client-side navigation, still in annotation mode, the new zone is outlined', z,
        z && z.frames === 1);
    await page.click('#late-text');
    z = await untilZone(page, (x) => x.formOpen, 2000);
    record('zone rendered later: a click in it opens the note form', z, z.formOpen === true);
    record('zone rendered later: one console line, from page A, and nothing else', errors,
        errors.length === 1 && /matches nothing/.test(errors[0]));
    await page.close();
}

await browser.close();

{
    // French page, client and labels from the CDN, labels slow, and the hostile observer: the reattachments
    // are spent before the labels land. Nothing may reach the page as an unhandled rejection.
    const frenchBrowser = await launch();
    const { page, errors } = await openPage(false, frenchBrowser);
    await page.evaluateOnNewDocument(() => {
        window.rejections = [];
        window.addEventListener('unhandledrejection', (e) => window.rejections.push(String(e.reason && e.reason.message || e.reason)));
        window.addEventListener('error', (e) => window.rejections.push('error: ' + e.message));
    });
    await page.setRequestInterception(true);
    let labelsServed = 0;
    page.on('request', (r) => {
        if (r.url() === CDN_BUNDLE) return r.respond({ status: 200, contentType: 'text/javascript', body: bundleText });
        if (r.url() === CDN_LABELS) {
            return setTimeout(() => { labelsServed += 1; r.respond({ status: 200, contentType: 'text/javascript',
                body: readFileSync(join(ROOT, 'client', 'labels', 'fr.js'), 'utf8') }).catch(() => {}); }, 1500);
        }
        r.continue().catch(() => {});
    });
    await page.goto(ORIGIN + '/french/x', { timeout: 10000 }).catch(() => {});
    await sleep(4000);
    const state = await Promise.race([
        page.evaluate(() => ({ removals: window.removals, elements: document.querySelectorAll('annotepage-notes').length,
            rejections: window.rejections })),
        sleep(5000).then(() => 'frozen: the page did not answer within 5 s')
    ]);
    const warned = errors.filter((e) => /removes the element/.test(e));
    record('French page, labels from the CDN, hostile observer: withdrawn, no unhandled rejection',
        { state, labelsServed }, typeof state === 'object' && state.elements === 0 && state.removals > 0 && state.removals <= 20
            && state.rejections.length === 0 && !errors.some((e) => /Uncaught|TypeError/.test(e)));
    record('French page, hostile observer: one console warning that says why, nothing else', errors,
        warned.length === 1 && errors.length === 1);
    frenchBrowser.process().kill('SIGKILL');
}

{
    // A site observer removing unknown body children. Its own browser: a frozen renderer would take the others with it.
    const hostileBrowser = await launch();
    const { page, errors } = await openPage(false, hostileBrowser);
    await page.goto(ORIGIN + '/hostile/x', { timeout: 10000 }).catch(() => {});
    await sleep(3000);
    const state = await Promise.race([
        page.evaluate(() => ({ removals: window.removals, elements: document.querySelectorAll('annotepage-notes').length })),
        sleep(5000).then(() => 'frozen: the page did not answer within 5 s')
    ]);
    const warned = errors.filter((e) => /removes the element/.test(e));
    record('site observer removing unknown body children: the page stays responsive, the tool gives up after a bounded number of tries',
        state, typeof state === 'object' && state.removals > 0 && state.removals <= 20 && state.elements === 0);
    record('site observer: one console warning that says why, nothing else', errors, warned.length === 1 && errors.length === 1);
    hostileBrowser.process().kill('SIGKILL');
}

pages.close();
const bad = results.filter((r) => !r.pass).length;
console.log('\n' + LABEL + ': ' + (results.length - bad) + '/' + results.length + ' ok');
process.exit(bad ? 1 : 0);
