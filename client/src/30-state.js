/* -- 7. State, browser memory, scope ------------------------------------- */

let host = null;            // the single element added to the site
let root = null;            // its shadow root
let ui = null;              // the interface elements, once built
let mode = false;           // is annotation mode on?
let notes = [];             // the page's notes, as the server states them
let anchored = [];          // { element, notes[] } : the notes found again
let orphans = [];           // notes whose element was not found
let historyOpen = false;    // resolved AND deployed notes are folded away
let target = null;          // element being annotated
let hovered = null;         // element under the pointer
let currentFailure = null;  // { title, detail } shown in the panel
let author = '';            // read at startup: see 90-boot
let timer = null;
let rafPending = false;

/* What we did NOT manage to read at the last load. We count it so we can say
   it: a note skipped in silence is a remark that disappears. */
let skipped = { newer: 0, unreadable: 0, unknown: 0 };

/* The salt of this project, and everything derived from it. "keys" stays
   null as long as the salt is unknown: no request, no decryption goes out
   before then. */
let saltText = '';
let keys = null;            // { id, encryptionKey, indexKey }
let PAGE_INDEX = '';        // blind index of the current page

const inTool = (n) => !!(host && n && (n === host || host.contains(n)));

/* -- The browser's memory ------------------------------------------------
   The try/catch blocks wrap ONLY the storage access, because that is the
   only thing here that is allowed to fail: private browsing, or storage
   refused by a browser policy. Widening them would turn a programming
   mistake into a silent failure, and therefore into one nobody can find. */

// A per-browser convenience, not an identity: nobody is authenticated, and
// the name is there to know who to talk to, not to prove who one is.
const AUTHOR_KEY = 'annotepage/author';

/* The salt is stored UNDER THE PROJECT ID. That naming is not cosmetic: two
   projects reviewed from the same browser must not overwrite each other.

   An unpleasant consequence, to be stated: localStorage is PER ORIGIN. The
   day staging becomes production, every reviewer has to paste the salt once
   more on the new domain. The notes themselves do not move -- and that is
   exactly what the rule "the domain is not in the key" buys. */
const saltKey = (project) => 'annotepage/salt/' + project;

const readSalt = (project) => {
    try {
        return String(window.localStorage.getItem(saltKey(project)) || '').trim();
    } catch (e) {
        // Without storage the salt will be asked for on every visit: that is
        // less comfortable, it is not a failure.
        return '';
    }
};

const writeSalt = (project, text) => {
    try {
        window.localStorage.setItem(saltKey(project), text);
        return true;
    } catch (e) {
        // We return false so the screen can SAY it: a salt that is not kept
        // will have to be pasted again on every page, and it is better to
        // know that straight away than on the third time.
        return false;
    }
};

const forgetSalt = (project) => {
    try {
        window.localStorage.removeItem(saltKey(project));
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
