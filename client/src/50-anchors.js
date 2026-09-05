/* -- 11. The three anchors of an element ---------------------------------
   None is reliable on its own: a path breaks at the first inserted block, a
   fingerprint of classes breaks when the styling is redone, a text excerpt
   breaks at the editorial pass. Together they make it possible to DEGRADE --
   to flag the note as orphaned -- instead of losing it. */

const cssPath = (el) => {
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && n !== document.body && n !== document.documentElement) {
        const tag = n.localName;
        let rank = 1;
        let s = n.previousElementSibling;
        while (s) {
            if (s.localName === tag) rank += 1;
            s = s.previousElementSibling;
        }
        parts.unshift(tag + ':nth-of-type(' + rank + ')');
        n = n.parentElement;
    }
    // Too long for the column: we drop the leading segments. The path becomes
    // relative and may designate several elements -- which is exactly why the
    // fingerprint and the excerpt exist.
    let path = parts.join(' > ');
    while (path.length > MAX_SELECTOR && parts.length > 1) {
        parts.shift();
        path = parts.join(' > ');
    }
    return clip(path, MAX_SELECTOR);
};

const fingerprintOf = (el) => {
    if (!el || el.nodeType !== 1) return '';
    let e = el.localName;
    if (el.id) e += '#' + el.id;
    const classes = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
    for (let i = 0; i < classes.length && i < 4; i += 1) e += '.' + classes[i];
    return clip(e, MAX_FINGERPRINT);
};

/**
 * The text by which a human recognises the element. It is what shows in the
 * panel: "About: Contact us". Never the path, never the fingerprint -- those
 * are anchors for machines.
 */
const excerptOf = (el) => {
    if (!el || el.nodeType !== 1) return '';
    let t = normalize(el.textContent);
    if (!t) {
        t = normalize(
            el.getAttribute('alt') ||
            el.getAttribute('aria-label') ||
            el.getAttribute('placeholder') ||
            el.getAttribute('title') ||
            (el.localName === 'input' ? el.value : '') ||
            ''
        );
    }
    return clip(t, MAX_EXCERPT);
};

/* -- 12. Finding the element of a note ----------------------------------- */

const score = (el, note) => {
    let s = 0;
    if (note.fingerprint && fingerprintOf(el) === note.fingerprint) s += 2;
    if (note.excerpt) {
        const t = excerptOf(el);
        if (t === note.excerpt) s += 2;
        else if (t && note.excerpt.length >= 12 && t.indexOf(note.excerpt.slice(0, 24)) === 0) s += 1;
    }
    return s;
};

/**
 * Three attempts, from the most precise to the widest. If none returns an
 * element that resembles it enough, the note becomes ORPHANED: it stays
 * readable in the panel, with its date and its author, instead of vanishing
 * without anyone knowing.
 */
const findElement = (note) => {
    if (!note.selector && !note.fingerprint && !note.excerpt) return null;

    // 1. The path, confirmed by at least one of the two other anchors.
    if (note.selector) {
        let el = null;
        try {
            el = document.body.querySelector(note.selector);
        } catch (e) {
            el = null; // path gone invalid: this is not a failure
        }
        if (el && !inTool(el)) {
            if (!note.fingerprint && !note.excerpt) return el;
            if (score(el, note) >= 1) return el;
        }
    }

    // 2. The fingerprint: same tag, same classes, same id.
    if (note.fingerprint) {
        const tag = note.fingerprint.split(/[#.]/)[0];
        let candidates = [];
        try {
            candidates = Array.prototype.slice.call(document.body.querySelectorAll(tag));
        } catch (e) {
            candidates = [];
        }
        let best = null;
        let bestScore = 0;
        for (let i = 0; i < candidates.length; i += 1) {
            const c = candidates[i];
            if (inTool(c)) continue;
            const s = score(c, note);
            if (s > bestScore) {
                best = c;
                bestScore = s;
            }
        }
        if (best && bestScore >= 2) return best;
    }

    // 3. The text alone, if it is long enough not to designate just
    //    anything. It is the anchor that best survives a restyling.
    if (note.excerpt && note.excerpt.length >= 12) {
        const all = document.body.querySelectorAll('*');
        for (let i = 0; i < all.length; i += 1) {
            const c = all[i];
            if (inTool(c)) continue;
            if (excerptOf(c) === note.excerpt) return c;
        }
    }

    return null;
};

/** Splits the server's notes between elements found again and orphans. */
const anchor = () => {
    anchored = [];
    orphans = [];
    for (let i = 0; i < notes.length; i += 1) {
        const note = notes[i];
        const el = findElement(note);
        if (!el) {
            orphans.push(note);
            continue;
        }
        let group = null;
        for (let j = 0; j < anchored.length; j += 1) {
            if (anchored[j].element === el) group = anchored[j];
        }
        if (!group) {
            group = { element: el, notes: [] };
            anchored.push(group);
        }
        group.notes.push(note);
    }
};

/* -- 12 bis. When the page redraws itself under the tool -------------------
   `anchor()` resolves the elements ONCE. A page that replaces a piece of its
   own DOM -- a click that re-renders a block, a framework that swaps a node
   for an equivalent one -- leaves us holding a node that is no longer in the
   document: it measures 0x0, and the badge does not move, it VANISHES.

   The two functions below are what lets refreshPositions notice and repair
   that, without the panel paying for it. */

/** True as soon as one remembered element has left the document. This is the
    safety net, and it is deliberately independent of the MutationObserver:
    an observer can be missing, disconnected, or blind to a change made
    before it was hooked up -- a detached node cannot hide. */
const anchorsStale = () => {
    for (let i = 0; i < anchored.length; i += 1) {
        if (!document.contains(anchored[i].element)) return true;
    }
    return false;
};

/**
 * What the PANEL would show of the current anchoring, as a string.
 *
 * The panel is rebuilt from scratch by drawPanel(), which costs the reader
 * their scroll position, their focus, and any reply half typed. So it is
 * only ever redrawn when this string changes -- that is, when a note has
 * actually moved between "anchored" and "orphaned", or when the groups no
 * longer hold the same notes. An element swapped for an equivalent one
 * changes NOTHING here, and rightly: only the markers have to be redrawn.
 *
 * Note identifiers are used, never the elements: two different nodes
 * carrying the same notes are the same thing as far as the panel goes.
 */
const anchorSignature = () => {
    const parts = [];
    for (let i = 0; i < anchored.length; i += 1) {
        const ids = [];
        for (let j = 0; j < anchored[i].notes.length; j += 1) {
            ids.push(anchored[i].notes[j].id);
        }
        parts.push(ids.join(','));
    }
    const lost = [];
    for (let i = 0; i < orphans.length; i += 1) lost.push(orphans[i].id);
    return parts.join('|') + '/' + lost.join(',');
};
