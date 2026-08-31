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
