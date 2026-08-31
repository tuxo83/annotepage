/* -- 1. Labels ----------------------------------------------------------
   No text meant for the screen is written anywhere but in 15-labels. See
   the header of that file for the two ways of replacing them. */

const ns = (window.Annotepage = window.Annotepage || {});

/* The package version, put where a console can read it. It is the only fact
   the tool publishes about itself: when a team says "it stopped working
   this morning", the first question is which one is running. */
ns.version = TOOL_VERSION;
ns.format = FORMAT;

const T = (key, values) => {
    const local = ns.labels || {};
    const defaults = ns.defaultLabels || {};
    // A missing label falls back on the default set; failing that, on the
    // key -- which should never reach the screen, but beats a hole.
    let text = local[key];
    if (typeof text !== 'string') text = defaults[key];
    if (typeof text !== 'string') text = key;
    if (!values) return text;
    return text.replace(/\{([a-z]+)\}/g, (raw, name) =>
        Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : raw
    );
};

/** "0 notes", "1 note", "n notes" -- the plural is a label. */
const readableCount = (n, zero, one, many) =>
    n === 0 ? T(zero) : n === 1 ? T(one) : T(many, { n: n });

/* -- 2. Small utilities -------------------------------------------------- */

const create = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    // textContent everywhere, innerHTML nowhere: the text of a note is typed
    // by a human and must never be interpreted as markup, whatever it
    // contains. This rule has no exception in this package, not even for the
    // setup screen.
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
};

const empty = (e) => {
    while (e.firstChild) e.removeChild(e.firstChild);
};

const normalize = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();

const clip = (t, max) => (t.length > max ? t.slice(0, max) : t);

/* -- 3. Bytes, text, base64url ------------------------------------------
   base64url WITHOUT padding: it is the only form in the format (FORMAT.md
   sections 1.1 and 3.3). It goes through a query string, a urlencoded body
   and an SQL column without escaping, and it can be copied by hand without a
   trailing "=" getting lost in an email. */

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

const utf8 = (t) => utf8Encoder.encode(String(t));
const fromUtf8 = (bytes) => utf8Decoder.decode(bytes);

const b64url = (source) => {
    const u = new Uint8Array(source);
    let raw = '';
    // In chunks: String.fromCharCode.apply on an array of 24000 bytes blows
    // the call stack in some browsers.
    for (let i = 0; i < u.length; i += 4096) {
        raw += String.fromCharCode.apply(null, u.subarray(i, i + 4096));
    }
    return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * Returns a Uint8Array, or null if the string is not base64url.
 *
 * Returning null rather than throwing: the caller is always in the middle of
 * reading a line that came off the network, and an unreadable line gets
 * counted, it does not stop the others from being read.
 */
const fromB64url = (text) => {
    const t = String(text).replace(/-/g, '+').replace(/_/g, '/');
    if (!/^[A-Za-z0-9+/]*$/.test(t)) return null;
    let raw = '';
    try {
        raw = atob(t + '==='.slice((t.length + 3) % 4));
    } catch (e) {
        return null;
    }
    const u = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) u[i] = raw.charCodeAt(i);
    return u;
};

/* -- 4. Versions ---------------------------------------------------------
   Is the fix for a note ALREADY ONLINE?
   We compare the three leading numbers of the version (1.0.69-rc.abc1234):
   they grow with every build. A note resolved in a version more recent than
   the one being served is fixed but not deployed yet, and that has to be
   said -- otherwise we hide it while the defect is still there.
   Unreadable or missing version: the fix is taken as NOT deployed, because
   showing one note too many costs less than hiding one that still counts. */

const versionNumbers = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || ''));
    return m ? [+m[1], +m[2], +m[3]] : null;
};

const alreadyDeployed = (fixVersion) => {
    const a = versionNumbers(fixVersion);
    const b = versionNumbers(SITE_VERSION);
    if (!a || !b) return false;
    for (let i = 0; i < 3; i += 1) {
        if (b[i] !== a[i]) return b[i] > a[i];
    }
    return true;
};

/**
 * ISO date from the server -> THE READER'S LOCAL TIME.
 *
 * The server writes in UTC with an explicit offset; the conversion happens
 * here, once, and nobody has to wonder which time zone they are looking at.
 *
 * The language is THE DOCUMENT'S (the lang attribute of <html>), falling
 * back on the browser's: on a French page read from an English browser,
 * "20 aout 2026" is more accurate than "Aug 20, 2026".
 */
const readableDate = (iso) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return T('date.unknown');
    const language = (document.documentElement.getAttribute('lang') || '').trim();
    try {
        return d.toLocaleString(language || undefined,
            { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) {
        try {
            return d.toLocaleString();
        } catch (e2) {
            return iso;
        }
    }
};
