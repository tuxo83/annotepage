/* -- 7. State, browser memory, scope ------------------------------------- */

let host = null;            // the single element added to the site
let root = null;            // its shadow root
let ui = null;              // the interface elements, once built
let mode = false;           // is annotation mode on?
let notes = [];             // the page's notes, as the server states them
let anchored = [];          // { element, notes[] } : the notes found again
let orphans = [];           // notes whose element was not found
let historyOpen = false;    // resolved AND deployed notes are folded away
let totals = null;          // { notes, open, pages } for the WHOLE project, or
                            // null: a server older than 2.5.0 does not send it,
                            // and the panel simply does not show the line
let retention = 0;          // days a thread is kept after its last message, 0
                            // when nothing expires. A server older than 2.7.0
                            // sends nothing, which reads as 0 -- the promise
                            // it made before this key existed
let expired = null;         // { notes, pages, last_sweep } : what retention has
                            // already taken from this project. null on a server
                            // that does not count, which is not the same thing
                            // as a project it has never taken anything from
let serverWide = null;      // { projects, notes, pages } for the WHOLE server,
                            // and only where its operator published them.
                            // Absent everywhere else, on purpose
let target = null;          // element being annotated
let hovered = null;         // element under the pointer
let currentFailure = null;  // { title, detail } shown in the panel
let author = '';            // read at startup: see 90-boot
let side = 'right';         // which edge the panel sits on: see readSide
let timer = null;
let rafPending = false;

/* The page is somebody else's, and it moves. `observer` watches it WHILE
   annotation mode is on -- never outside it -- and its only job is to raise
   `domDirty`. The work itself belongs to the animation frame in
   refreshPositions: a page that mutates in a loop would otherwise pay for a
   full re-anchoring on every single mutation. */
let observer = null;
let domDirty = false;

/* What we did NOT manage to read at the last load. We count it so we can say
   it: a note skipped in silence is a remark that disappears. */
let skipped = { newer: 0, unreadable: 0, unknown: 0 };

/* The key of this project, and everything derived from it. "keys" stays
   null as long as the key is unknown: no request, no decryption goes out
   before then. */
let keyText = '';
let keys = null;            // { id, encryptionKey, indexKey }
let PAGE_INDEX = '';        // blind index of the current page

/* WHICH PAGE THAT INDEX BELONGS TO. Read once at boot, it was the only
   answer for the life of the document -- and a router that changes the path
   without a reload kept the first page's notes on every later one. It is now
   written wherever the index is computed, and compared against the address at
   every sign of navigation (85-pages). */
let PAGE_PATH = '';
/* True while this copy stands down because the current path is outside the
   declared prefix. A full load would simply have stayed silent; a copy that
   outlives its first page has to remember WHY it is silent, because only this
   reason goes away when the path changes. */
let outOfScope = false;
/* The number of the boot under way. Raised by every start() and by leaving
   the declared prefix, so that an answer landing for an earlier boot can tell
   it no longer belongs to the page (bootIsStale, 85-pages). */
let bootRun = 0;

const inTool = (n) => !!(host && n && (n === host || host.contains(n)));

/* -- The browser's memory ------------------------------------------------
   The try/catch blocks wrap ONLY the storage access, because that is the
   only thing here that is allowed to fail: private browsing, or storage
   refused by a browser policy. Widening them would turn a programming
   mistake into a silent failure, and therefore into one nobody can find. */

// A per-browser convenience, not an identity: nobody is authenticated, and
// the name is there to know who to talk to, not to prove who one is.
const AUTHOR_KEY = 'annotepage/author';

/* The side the panel sits on. GLOBAL, exactly like the name above and
   deliberately NOT under the project id: which edge a panel should sit on is
   a fact about the screen and the hand in front of it, not about the project
   being reviewed. Asking again on the next project would be asking the same
   person the same question twice.

   Two values and no third one. Annotation mode makes the layer take every
   click, so every pixel of panel is a pixel of page that can no longer be
   pointed at -- a panel that could sit anywhere would only move that loss
   around, and would have to be moved back. */
const SIDE_KEY = 'annotepage/side';

function readSide() {
    try {
        return window.localStorage.getItem(SIDE_KEY) === 'left' ? 'left' : 'right';
    } catch (e) {
        // Without storage the panel starts on the right every visit: the
        // choice still works, it is just not remembered.
        return 'right';
    }
}

function writeSide(value) {
    side = value === 'left' ? 'left' : 'right';
    try {
        window.localStorage.setItem(SIDE_KEY, side);
    } catch (e) {
        // No consequence: only the memory of the side is lost.
    }
}

/* The key is stored UNDER THE PROJECT ID. That naming is not cosmetic: two
   projects reviewed from the same browser must not overwrite each other.

   An unpleasant consequence, to be stated: localStorage is PER ORIGIN. The
   day staging becomes production, every reviewer has to paste the key once
   more on the new domain. The notes themselves do not move -- and that is
   exactly what the rule "the domain is not in the key" buys. */
const keyKey = (project) => 'annotepage/key/' + project;

const readSalt = (project) => {
    try {
        return String(window.localStorage.getItem(keyKey(project)) || '').trim();
    } catch (e) {
        // Without storage the key will be asked for on every visit: that is
        // less comfortable, it is not a failure.
        return '';
    }
};

const writeSalt = (project, text) => {
    try {
        window.localStorage.setItem(keyKey(project), text);
        return true;
    } catch (e) {
        // We return false so the screen can SAY it: a key that is not kept
        // will have to be pasted again on every page, and it is better to
        // know that straight away than on the third time.
        return false;
    }
};

const forgetSalt = (project) => {
    try {
        window.localStorage.removeItem(keyKey(project));
    } catch (e) {
        // Nothing to do: there was no storage in the first place.
    }
};

function readAuthor() {
    let raw = '';
    try {
        raw = window.localStorage.getItem(AUTHOR_KEY) || '';
    } catch (e) {
        return '';
    }
    return normalize(raw);
}

function writeAuthor(value) {
    author = value;
    try {
        window.localStorage.setItem(AUTHOR_KEY, value);
    } catch (e) {
        // No consequence: only the memory of the name is lost.
    }
}

/* -- The scope -----------------------------------------------------------
   Two checks, and neither is a security measure. They keep a tag left in a
   shared template from collecting notes where the project does not go, and
   keep a client from talking to a server that is going to say no. The real
   boundary is the server's domain lock (FORMAT.md section 6.2), which is
   itself only an anti-abuse measure. */

const inScope = () => {
    if (DOMAINS.length && DOMAINS.indexOf(location.origin) === -1) return false;
    if (PATH_PREFIX && pagePath().indexOf(PATH_PREFIX) !== 0) return false;
    return true;
};

/* -- The zone ------------------------------------------------------------
   Where on the page a remark can be WRITTEN (data-zone). Reading is never
   restricted: a note anchored outside the zone is still listed and badged,
   because a remark written before the zone was declared is still a remark.

   Everything below takes what it judges as parameters -- the element, the
   selector, the browser's own verdict on a selector -- so that
   client/tools/check.mjs runs it against plain objects. */

/**
 * The items of a selector list, split on the commas that separate them.
 *
 * NOT text.split(','): a comma inside :is(a, b), inside [title="a,b"] or
 * after a backslash belongs to one item. What an item is still left to the
 * browser -- this only has to find where one ends, so that the console can
 * name the item that is wrong instead of repeating a whole list back.
 */
const selectorItems = (text) => {
    const items = [];
    let depth = 0;
    let quote = '';
    let from = 0;
    for (let i = 0; i < text.length; i += 1) {
        const c = text[i];
        if (c === '\\') {
            i += 1;
        } else if (quote) {
            if (c === quote) quote = '';
        } else if (c === '"' || c === '\'') {
            quote = c;
        } else if (c === '(' || c === '[') {
            depth += 1;
        } else if ((c === ')' || c === ']') && depth > 0) {
            depth -= 1;
        } else if (c === ',' && depth === 0) {
            items.push(text.slice(from, i).trim());
            from = i + 1;
        }
    }
    items.push(text.slice(from).trim());
    return items;
};

/**
 * The declared zone, judged once: { declared, valid, selector, broken }.
 *
 * `compiles` is the browser asked about one selector. It is the only judge
 * of CSS here -- a second grammar written in this file would be a second one
 * to keep in step with every browser.
 *
 * AN EMPTY ITEM IS BROKEN TOO: ".a," and ", .b" are refused by every browser,
 * and so is an empty attribute. `broken` is what the console line names.
 *
 * AND INVALID NEVER MEANS "EVERYWHERE". A selector that does not parse
 * restricts to nothing at all: falling back on the whole page would open
 * every part the site meant to close, with nothing on screen to say so.
 */
const zoneFrom = (declared, text, compiles) => {
    if (!declared) return { declared: false, valid: true, selector: '', broken: '' };
    const selector = String(text).trim();
    const items = selectorItems(selector);
    for (let i = 0; i < items.length; i += 1) {
        if (items[i] === '' || !compiles(items[i])) {
            return { declared: true, valid: false, selector: selector, broken: items[i] };
        }
    }
    /* The whole list as well: the items passing one by one is what the
       split believes, and the list is what will actually be matched. */
    if (!compiles(selector)) return { declared: true, valid: false, selector: selector, broken: selector };
    return { declared: true, valid: true, selector: selector, broken: '' };
};

/** The zone element holding `el` -- `el` itself when it matches -- or null.
    Walked by hand rather than with closest(), so that the walk is the code
    under test and not a stand-in for it. */
const zoneHolding = (el, selector) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        if (n.matches(selector)) return n;
    }
    return null;
};

/** 'anywhere' (no zone declared), 'inside', 'outside', or 'nowhere' (a
    selector that is not one). Asked at every pick, never cached: the zone
    may have been rendered, or replaced, since the last one. */
const pickVerdict = (zone, el) => {
    if (!zone.declared) return 'anywhere';
    if (!zone.valid) return 'nowhere';
    return zoneHolding(el, zone.selector) ? 'inside' : 'outside';
};

/** Of the elements matching the zone, those no other match contains. A
    nested zone adds no room to write, and outlining it too would draw a
    frame inside a frame for every paragraph of `.article, .article p`. */
const outermostZones = (elements, selector) => {
    const outer = [];
    for (let i = 0; i < elements.length; i += 1) {
        if (!zoneHolding(elements[i].parentElement, selector)) outer.push(elements[i]);
    }
    return outer;
};
