/* -- 19 ter. The page changes, the document does not --------------------
   Everything in this client was written for one page per document: the path
   was read at boot, the host element was appended to the body once, and
   nothing looked again. Two families of sites break that, in two different
   ways, and both are common enough to be the default of whole frameworks:

     THE ADDRESS CHANGES, THE BODY STAYS -- Next.js, Nuxt, Vue Router,
     SvelteKit, Inertia. history.pushState, replaceState, the back button. The
     tool stayed, with the first page's notes, on every page after it.

     THE BODY IS REPLACED -- Turbo, Astro's ClientRouter, htmx's hx-boost,
     Livewire's wire:navigate. The host element went away with the old body,
     and a tag sitting inside the body was executed again and built a second
     tool.

   WHAT COUNTS AS ANOTHER PAGE IS THE PATH, AND ONLY THE PATH: it is what the
   page index is computed from (20-crypto), so it is the only change that can
   move a note. A body swapped under the same address is the same page -- the
   anchoring already degrades an element that is gone into an orphan, and
   takes it back when it returns (50-anchors). A query string or a fragment
   that changes is the same page too, for the same reason.

   NOTHING HERE TOUCHES THE DERIVATION. pagePath() and indexOfPath() are
   called exactly as the boot calls them; what changed is how often. */

/* -- The slot on the document -------------------------------------------
   Declared in 00-preamble, which is the first reader of it: a second copy has
   to find it before doing anything at all. Written here, by the copy that
   stays. Everything below takes the document and the window as parameters so
   that client/tools/check.mjs can hand it plain objects. */

const slotOf = (doc) => {
    if (!doc[INSTANCE_SLOT]) doc[INSTANCE_SLOT] = { copy: null, listening: false };
    return doc[INSTANCE_SLOT];
};

/** Takes the document for `copy`. False when another copy already holds it. */
const claimDocument = (doc, copy) => {
    const slot = slotOf(doc);
    if (slot.copy && slot.copy !== copy) return false;
    slot.copy = copy;
    return true;
};

/* Given back ONLY by a copy handing over to a newer version (80-upgrade). A
   copy that went silent keeps the slot, and that is deliberate: silent is
   still this document's answer, and a re-executed tag that booted again would
   ask the same server the same question at every navigation. */
const releaseDocument = (doc, copy) => {
    const slot = slotOf(doc);
    if (slot.copy === copy) slot.copy = null;
};

/**
 * Hears every change of address, ONCE PER DOCUMENT, and forwards it to
 * whichever copy holds the slot at that moment.
 *
 * ONCE, because a copy that hands over to a newer version cannot take a
 * wrapper back off history -- the site may have wrapped it again since -- and
 * the newer copy wrapping on top would announce every navigation twice. The
 * listeners installed here never belong to a copy: they read the slot when
 * they fire.
 *
 * THE NAVIGATION API WHERE THERE IS ONE. `currententrychange` fires for
 * pushState, replaceState and a traversal alike, and it costs the site
 * nothing. history is only wrapped where that API is missing, since wrapping
 * a method of somebody else's page is the more intrusive of the two. popstate
 * is heard in both cases: it is free, and the path comparison makes a second
 * announcement of the same change a no-op.
 *
 * @returns {boolean} whether this call installed anything
 */
const listenForPages = (win, doc) => {
    const slot = slotOf(doc);
    if (slot.listening) return false;
    slot.listening = true;

    const tell = () => {
        if (slot.copy) slot.copy.recheck();
    };

    win.addEventListener('popstate', tell);

    const nav = win.navigation;
    if (nav && typeof nav.addEventListener === 'function') {
        nav.addEventListener('currententrychange', tell);
        return true;
    }

    const history = win.history;
    ['pushState', 'replaceState'].forEach((name) => {
        const original = history && history[name];
        if (typeof original !== 'function') return;
        history[name] = function () {
            // The site's call first, untouched, and its exception with it: a
            // refused URL is the site's to hear about, and a navigation that
            // did not happen is not one to follow.
            const result = original.apply(this, arguments);
            /* THE ONE try IN THIS SECTION, AND IT IS NOT A HABIT. This line
               runs INSIDE the site's own call to pushState, in its router, in
               the middle of its render. Anything thrown here would break the
               site's navigation -- which is the one failure this tool may
               never cause. A listener that throws only reaches the console;
               this does not have that luxury. */
            try {
                tell();
            } catch (e) {
                /* The page moved on without us: the next sign of navigation
                   compares the path again. */
            }
            return result;
        };
    });
    return true;
};

/**
 * WHAT A CHANGE OF ADDRESS ASKS OF THIS COPY -- the whole decision, with no
 * DOM in it, so it is checked rather than described.
 *
 *   none    nothing to do: same path, or a copy that must not move
 *   note    out of scope and already standing down there: remember the path
 *   leave   the path left the declared prefix: take everything down
 *   enter   the path came back into it: boot, as a full load of it would
 *   follow  another page for a running tool: its index, its notes
 *   wait    another page, but the tool is not in its normal shape -- a boot
 *           under way, a key being asked for, a silence. Nothing is recorded,
 *           so the boot looks again when it lands (proceed, 90-boot).
 *
 * `frozen` is a configuration that was refused, or a copy that has handed
 * over: neither depends on the page, and neither may act on one.
 */
const pageStep = (s) => {
    if (s.frozen) return 'none';
    if (s.path === s.known) return 'none';
    if (!s.inScope) return s.outOfScope ? 'note' : 'leave';
    if (s.outOfScope) return 'enter';
    return s.running ? 'follow' : 'wait';
};

/* -- What the running copy does about it --------------------------------- */

/** Everything that belongs to ONE page and to no other. The key, the project
    totals and the side of the panel are not in it: they belong to the
    project and to the browser, and a navigation changes neither. */
const forgetPage = () => {
    notes = [];
    anchored = [];
    orphans = [];
    historyOpen = false;
    currentFailure = null;
    skipped = { newer: 0, unreadable: 0, unknown: 0 };
};

/**
 * Another page, and the tool is running: the notes of this one, from now.
 *
 * THE PANEL STAYS OPEN IF IT WAS. In annotation mode every click on the page
 * is captured, so a navigation that happens then is the back button or the
 * site's own doing -- and a reviewer who pressed Back while reading the list
 * wants the list of where they landed, not to have the tool closed on them.
 *
 * WHAT DOES NOT SURVIVE is whatever was aimed at the page that left: the
 * window of a remark, the form half written, the outline. The element they
 * point at is gone, and a remark sent from that form now would be filed under
 * the NEW page's index -- a note on the wrong page, which is worse than a
 * note not written.
 *
 * THE OLD NOTES GO BEFORE THE NEW ONES ARRIVE. The panel is redrawn empty at
 * once, and PAGE_INDEX is cleared until the new one is computed: a reload
 * started in that gap (entering the mode, a reply landing) asks for nothing
 * rather than for the page that left, and one already in flight is discarded
 * when it lands (reload, 90-boot).
 */
const changePage = () => {
    const path = PAGE_PATH;
    const derived = keys;
    closePop();
    closeForm();
    hideHighlight();
    hovered = null;
    forgetPage();
    PAGE_INDEX = '';
    redraw();
    return indexOfPath(derived.indexKey, path).then((index) => {
        // Moved again meanwhile, or the key was forgotten or replaced: the
        // later change owns the page now.
        if (path !== PAGE_PATH || keys !== derived) return null;
        PAGE_INDEX = index;
        return reload();
    });
};

/** Out of the declared prefix: exactly what a full load of that page shows,
    which is nothing. The key stays: coming back must not ask for it. */
const stepAside = () => {
    withdraw();
    forgetPage();
    PAGE_INDEX = '';
    outOfScope = true;
};

/** Compares the address with the page this copy is on, and acts. */
const followPage = () => {
    const path = pagePath();
    const step = pageStep({
        frozen: !!CONFIG_FAILURE || handingOver,
        path: path,
        known: PAGE_PATH,
        inScope: inScope(),
        outOfScope: outOfScope,
        running: !!(keys && ui)
    });
    if (step === 'none' || step === 'wait') return step;
    PAGE_PATH = path;
    if (step === 'leave') stepAside();
    else if (step === 'enter') start();
    else if (step === 'follow') changePage();
    return step;
};

/* -- The host element, kept in the document ------------------------------
   The host is a child of <body>, and a body that is replaced -- or emptied and
   refilled -- takes it along. It is PUT BACK rather than moved somewhere a
   swap cannot reach: its shadow root, its stylesheet and its listeners are
   all intact on the detached element, so reattaching it is the whole repair,
   and the one element the site receives stays where it always was.

   WATCHED ON TWO NODES, NEITHER OF THEM IN DEPTH. <html>'s children, which is
   where a body is swapped whole; the body's own children, which is where one
   is emptied. childList without subtree: the callback runs for a change at
   those two levels and for nothing else the page does, however busy. */

let hostWatch = null;
let watchedBody = null;

const watchFrame = () => {
    hostWatch.disconnect();
    watchedBody = document.body;
    hostWatch.observe(document.documentElement, { childList: true });
    if (watchedBody) hostWatch.observe(watchedBody, { childList: true });
};

/* A mutation is a sign the page may have changed: the same question a
   re-executed tag or a history change asks, answered in the same place. */
const watchHost = () => {
    if (hostWatch || typeof MutationObserver !== 'function') return;
    hostWatch = new MutationObserver(() => recheck());
    watchFrame();
};

const unwatchHost = () => {
    if (hostWatch) hostWatch.disconnect();
    hostWatch = null;
    watchedBody = null;
};

const keepHostAttached = () => {
    const body = document.body;
    if (!body) return;
    const swapped = !!hostWatch && watchedBody !== body;
    if (swapped) {
        watchFrame();
        /* ANNOTATION MODE WATCHES THE BODY IN DEPTH (enterMode), and the one
           it watches has just left the document: it would never raise
           domDirty again. It moves to the body that is there, and the
           anchoring is redone once, since every element it held is gone. */
        if (observer) {
            observer.disconnect();
            observer.observe(body, { childList: true, subtree: true });
            domDirty = true;
        }
    }
    if (!host) return;
    const detached = !host.isConnected;
    if (!detached && !swapped) return;

    /* COPIES OF THE HOST THAT ARE NOT THE HOST. Turbo keeps a snapshot of
       every page it leaves as body.cloneNode(true), and htmx keeps its history
       as the body's markup: both put back, on Back, a body carrying an
       <annotepage-notes> with the inline style and without the shadow root --
       a full-screen element with nothing in it. Removed, because it is ours;
       and only when it has no shadow root, because one that has is a tool,
       and not this copy's to remove. */
    const found = document.querySelectorAll('annotepage-notes');
    for (let i = 0; i < found.length; i += 1) {
        if (found[i] !== host && !found[i].shadowRoot) found[i].remove();
    }
    if (detached) body.appendChild(host);
};

/**
 * THE ONE ANSWER to every sign that the page may have changed: a history
 * entry, a traversal, a body swapped, a tag executed again. Each of them asks
 * both questions, since none of them says which one it is about: Turbo swaps
 * the body AND pushes a history entry, and a re-executed tag says nothing at
 * all about which.
 */
function recheck() {
    keepHostAttached();
    followPage();
}
