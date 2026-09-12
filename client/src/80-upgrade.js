/* -- 19. A stale copy replaces itself ------------------------------------
   The problem, in one line: the distributed tag points at a RANGE on a CDN
   (annotepage-client@2), and jsDelivr serves that range with
   max-age=604800. A fix published today does not reach a visitor who came
   back within seven days. The lifetime is the CDN's to set and no attribute
   of <script> touches it -- integrity, crossorigin, defer, async, none of
   them. Cache-Control is a response header; the requester cannot overrule
   it.

   So we do not fight the cache, we WALK AROUND IT. The stale copy does not
   refresh its own URL: it loads a DIFFERENT one, the pinned
   annotepage-client@X.Y.Z/dist/annotepage.js, which this browser has never
   fetched and which therefore no cache entry can answer.

   WHERE THE CURRENT VERSION COMES FROM: the answer the client already asks
   for. `list` runs before the DOM is touched, and the server names the
   current client version in it. No second request, no extra file to host,
   and the answer lands exactly at the seam where the check belongs.

   IT ANNOUNCES, IT NEVER GATES. The announced version says "there is
   something newer" and nothing else. It must never decide whether a request
   is allowed, and nothing here compares it to authorise anything:
   compatibility belongs to the FORMAT number and only to it (FORMAT.md
   section 7). 2.1.0 and 2.2.0 speak the same format by construction, and a
   client that refused to talk to a server one release ahead would break a
   pair that works.

   WHY EVERY DOUBT IS A SILENCE. The announcement rides on an answer from a
   server that may be anybody's. A self-hosted server announces whatever it
   was installed with, which can be older than what is on this page. So:
   absent, unreadable, malformed, EQUAL or OLDER than ours -- carry on, say
   nothing. We only ever move forward, never back. A server cannot push a
   client downhill. */

/* THE SHAPE OF A VERSION, and it is the only gate that matters here.

   This string arrives over the network from a server we do not own. It is
   never concatenated into a URL as it stands: it is matched against this
   expression, and the URL is then REBUILT from a base written here, in this
   file. A compromised or hostile server can therefore make us load a version
   of the official package that does not exist -- which fails, and is handled
   -- and nothing else. No host, no path, no scheme, no protocol-relative
   "//evil", no "../", no query, no "@" of its own.

   Strict on purpose: three numbers, nothing around them. No pre-release
   suffix (a pre-release is not what one pushes to every visitor of every
   site), no leading zero, at most four digits per part. */
const ANNOUNCED_SHAPE = /^(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})$/;

/* The CDNs whose exact-version address we know how to write ourselves, and
   only those. `base` is the whole beginning of the URL: nothing of what the
   server said ever appears before the version number.

   `prefix` is matched against the PATHNAME of the tag's own src, and the host
   is compared whole -- indexOf on the full URL would accept
   "cdn.jsdelivr.net.example.com". Both entries are the npm package, which is
   the only package this file will ever point at. */
const CDNS = [
    {
        host: 'cdn.jsdelivr.net',
        prefix: '/npm/annotepage-client@',
        base: 'https://cdn.jsdelivr.net/npm/annotepage-client@'
    },
    {
        host: 'unpkg.com',
        prefix: '/annotepage-client@',
        base: 'https://unpkg.com/annotepage-client@'
    }
];

/**
 * Which CDN is serving THIS copy, or null -- and null is the interesting
 * case, because it means the site serves the file itself.
 */
const cdnServing = (src) => {
    let url;
    try {
        url = new URL(String(src));
    } catch (e) {
        return null;
    }
    if (url.protocol !== 'https:') return null;
    for (let i = 0; i < CDNS.length; i += 1) {
        const cdn = CDNS[i];
        if (url.host === cdn.host && url.pathname.indexOf(cdn.prefix) === 0) return cdn;
    }
    return null;
};

/** The address of one exact version, BUILT HERE. Null if anything is off. */
const officialUrl = (cdn, version) => {
    // Checked again, on the very line that builds the string: the caller
    // already checked, and a second reader of this file should not have to
    // go and verify that it did.
    if (!cdn || !ANNOUNCED_SHAPE.test(String(version))) return null;
    return cdn.base + version + '/dist/annotepage.js';
};

/**
 * The version the server announces, IF it is newer than ours. Null in every
 * other case, and that includes every case of doubt: no field, not a string,
 * not three numbers, equal to ours, older than ours.
 */
const announcedVersion = (data) => {
    if (!data || typeof data !== 'object') return null;
    const announced = data.client_version;
    if (typeof announced !== 'string' || !ANNOUNCED_SHAPE.test(announced)) return null;

    const theirs = versionNumbers(announced);
    const mine = versionNumbers(TOOL_VERSION);
    if (!theirs || !mine) return null;
    for (let i = 0; i < 3; i += 1) {
        if (theirs[i] !== mine[i]) return theirs[i] > mine[i] ? announced : null;
    }
    // Equal: nothing to say, and nothing to load.
    return null;
};

/* Set when we are behind and we are NOT going to do anything about it --
   the file is served by the site itself. The panel says so, at every draw,
   the way the public-key notice does: a message shown once at load is read
   by whoever happened to be looking. */
let upgradeAvailable = '';

/* True from the moment the replacement tag is in the document. It stops the
   old copy building anything, and it stops a second injection. */
let handingOver = false;

/**
 * Injects the pinned version and stands down.
 *
 * The new tag CARRIES THE data- ATTRIBUTES OF THE OLD ONE, and it has to:
 * the client reads everything it knows from its own tag
 * (document.currentScript, 00-preamble), so a bare tag would produce a copy
 * with no server, no project and no key -- which is a copy that does
 * strictly nothing. The integrity attribute is deliberately NOT carried
 * over: it is the digest of the version we are leaving, and it would refuse
 * the version we are fetching.
 *
 * `onFailure` is called if that tag never loads -- a version announced but
 * never published, a CDN that is down. We are then back to being merely old,
 * which is the state we started in, and the tool boots normally. Losing the
 * tool entirely because a number was wrong somewhere would be a worse
 * outcome than being one release behind.
 */
const handOverTo = (cdn, version, onFailure) => {
    const url = officialUrl(cdn, version);
    /* No tag, nothing to hand over: the replacement copy reads the data-
       attributes of this one, and a copy configured by window.annotepageConfig
       has none. The caller cannot get here -- cdnServing('') says no -- and it
       is written anyway, because what this function does when `script` is null
       is dereference it. */
    if (!url || !script || handingOver) return false;
    handingOver = true;

    // BEFORE the new copy builds anything: its element and its listeners go
    // first, or the page ends up carrying two pills. At the seam there is
    // usually nothing to remove -- which is the whole point of checking
    // before the work rather than after it.
    withdraw();

    const fresh = document.createElement('script');
    const attributes = script.attributes;
    for (let i = 0; i < attributes.length; i += 1) {
        const name = attributes[i].name;
        if (name.indexOf('data-') === 0) fresh.setAttribute(name, attributes[i].value);
    }
    fresh.src = url;
    fresh.addEventListener('error', () => {
        handingOver = false;
        onFailure();
    });
    (document.head || document.documentElement).appendChild(fresh);
    return true;
};

/* -- 19 bis. The label set that ships BESIDE this file --------------------
   Why this lives here, in the file about upgrading: the question is the same
   one, and the knowledge answering it is the same knowledge. This file is
   where the published package's LAYOUT is written down -- that an exact
   version of the client is at <base>@<version>/dist/annotepage.js on the two
   CDNs above. labels/fr.js is one directory over, in the same package, at the
   same version. Written down twice, the two copies drift the day the package
   moves a file, and the half nobody runs is the one that breaks. */

/* THE SETS THIS PACKAGE ACTUALLY SHIPS. English is not one of them: English
   is what the tool already says (15-labels), and fetching a file to be told
   so would be a request that buys nothing.

   Everything else stays English AND ASKS FOR NOTHING. A page in German would
   otherwise cost every one of its visitors a request for a de.js this package
   has never published -- a 404 the browser writes into the console itself, on
   every page of that site, for a file that is not coming. */
const SHIPPED_LABELS = ['fr'];

/**
 * Which shipped set a declared language asks for, or '' for none.
 *
 * THE REGION IS NOT PART OF THE QUESTION. `lang="fr-CA"` is French -- the
 * subtag says which French, and this package ships one. Comparing the whole
 * string would leave every regional French page in English while its author
 * watched a lang attribute that looks right, which is the likeliest way for
 * this to fail in the wild.
 */
const shippedLabelsFor = (language) => {
    const primary = String(language || '').trim().toLowerCase().split('-')[0];
    return SHIPPED_LABELS.indexOf(primary) === -1 ? '' : primary;
};

/**
 * The address of that set beside THIS copy of the client, or null.
 *
 * ONLY FROM A CDN WE RECOGNISE, and that is the rule rather than a gap. There
 * the layout is the npm package's own, so labels/fr.js is published beside
 * dist/annotepage.js and asking for it is asking for a file that exists. A
 * copy served by the site itself is one file somebody arranged as they liked:
 * deducing a neighbour for it is the request that answers 404 in every
 * console, which is exactly why a local label file is declared and never
 * looked for (15-labels). Those sites declare data-labels, as they do today.
 *
 * Relative to this file, so the set comes from the version -- or the range --
 * the tag pinned, and a page can never end up with labels from one release
 * and a panel from another.
 *
 * Nothing the page said is ever built into the address: the language SELECTS
 * one of the names in SHIPPED_LABELS, and those are written above.
 */
const shippedLabelsUrl = (src, language) => {
    const set = shippedLabelsFor(language);
    if (!set || !cdnServing(src)) return null;
    try {
        return new URL('../labels/' + set + '.js', String(src)).href;
    } catch (e) {
        return null;
    }
};

/**
 * WHICH LABEL FILE THIS PAGE LOADS, if any -- the whole rule in one place,
 * because the rule is an order and an order written across two files is an
 * order that gets read wrong.
 *
 * A file DECLARED on the tag wins, always, including over a language this
 * package does ship: data-labels is how somebody OVERRIDES, and a site that
 * has said what its panel says must not be contradicted by its own lang
 * attribute. It is also the only way to load a language nobody ships.
 */
const labelsFileFor = (declared, src, language) =>
    declared || shippedLabelsUrl(src, language);
