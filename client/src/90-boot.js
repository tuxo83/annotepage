/* -- 19. Reading the notes ----------------------------------------------- */

const redraw = () => {
    if (!ui) return;
    anchor();
    drawPanel();
    drawMarkers();
};

const reload = () =>
    call('list').then((r) => {
        if (!r.ok) {
            // The tool is already in place: we no longer keep quiet. The
            // notes already on screen stay, with the warning that they may
            // be incomplete.
            const failure = failureFrom(r, 'error.title_read');
            failure.detail = failure.detail + '\n' + T('error.partial_read');
            currentFailure = failure;
            redraw();
            return null;
        }
        return readList(r.data).then((read) => {
            notes = read;
            currentFailure = null;
            redraw();
            return null;
        });
    });

/* -- 20. Startup ----------------------------------------------------------
   The order matters: we ask the API BEFORE touching the DOM. If it does not
   answer what it should, the site never saw anything go by.

   One exception, accepted: the setup and salt-pasting screens, which CANNOT
   ask the API -- without a salt there is no page index to give it. They are
   declared (data-setup) or asked for by a tag that already carries a
   project: either way, somebody put that tag here on purpose. */

let localLabelsLoaded = false;

const loadLocalLabels = () => {
    if (!LOCAL_LABELS_URL || localLabelsLoaded || !root) return Promise.resolve();
    localLabelsLoaded = true;
    return new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = LOCAL_LABELS_URL;
        s.addEventListener('load', () => resolve(true));
        s.addEventListener('error', () => resolve(false));
        // INSIDE THE SHADOW ROOT, and not in <head> or <body>: a script
        // inserted into a shadow root runs like any other -- it is connected
        // to the document -- but it appears neither in
        // document.querySelectorAll('script') nor in the page's node count.
        // The only node the site receives stays the host element, and that
        // is checkable: +1 element, not +2.
        root.appendChild(s);
    });
};

const withdraw = () => {
    if (host) host.remove();
    host = null;
    root = null;
    ui = null;
};

/** A blocking screen: the host exists from now on, the labels come first. */
const showScreen = (open) => {
    buildHost();
    loadLocalLabels().then(open);
};

/**
 * Does the server have something to SAY at startup?
 *
 * "inactive", "nonjson" and "network" are silences: the tool is not
 * configured here, PHP is not running, or the browser is offline. Nobody has
 * written anything yet, there is nothing to announce.
 *
 * A REFUSAL, on the other hand, gets said -- and that is a deliberate change
 * from the original tool. A firewall answering 403 on the very first request
 * made the tool entirely invisible: one looked for the failure in the wrong
 * file for half a day. The tag carries a project, so somebody put it here on
 * purpose: we speak.
 */
const speaksAtStartup = (r) =>
    r.cause === 'server' || r.cause === 'failure' || String(r.cause).indexOf('refused') === 0;

/**
 * The salt is known and checked: we derive the page index, we ask the
 * server, and the tool takes its normal shape.
 */
function startWithSalt(text, derived) {
    saltText = text;
    keys = derived;

    return indexOfPath(keys.indexKey, pagePath())
        .then((index) => {
            PAGE_INDEX = index;
            return call('list');
        })
        .then((first) => {
            if (!first.ok && !speaksAtStartup(first)) {
                // Complete silence: no node, no pixel, no message. If a salt
                // screen was open, it goes away with the rest.
                withdraw();
                return null;
            }

            // From here on the tool EXISTS, and will no longer keep quiet
            // about its failures.
            buildHost();
            return loadLocalLabels().then(() => {
                clearLayer();
                buildUi();
                if (first.ok) {
                    return readList(first.data).then((read) => {
                        notes = read;
                        redraw();
                        return null;
                    });
                }
                currentFailure = failureFrom(first, 'error.title_read');
                redraw();
                return null;
            });
        });
}

const start = () => {
    author = readAuthor();

    // Outside the project's scope: silence. So the tag can live in a
    // template shared by the whole site.
    if (!inScope()) return;

    if (!CRYPTO) {
        // Without a secure context nothing is possible -- but if somebody
        // declared a project here, they have a right to know why.
        if (PROJECT || KEY_DECLARED || SETUP_REQUESTED) showScreen(openContextScreen);
        return;
    }

    /* THE TAG CARRIES THE KEY: the project is public, and that settles the
       mode before anything else. Nothing is asked, nothing is read from
       localStorage and NOTHING IS WRITTEN TO IT -- the key is in the page,
       and a stored copy would buy nothing except a divergent state on the
       day the tag changes. The interface then says so at every draw
       (PUBLIC_KEY, 60-ui). */
    if (KEY_DECLARED) {
        const keyBytes = saltFromText(DECLARED_KEY);
        if (!keyBytes) {
            /* An attribute somebody wrote on purpose, and it is not a key.
               Staying silent here would be the behaviour of a tag carrying
               no project at all, and the difference is exactly what nobody
               would find. */
            showScreen(() => openTagScreen(T('tag.key_shape')));
            return;
        }

        derive(keyBytes).then((derived) => {
            /* Both attributes on one tag: they have to AGREE, and the id is
               the one thing the key can check itself against (FORMAT.md
               1.2). Disagreement is refused exactly as a wrongly pasted key
               is -- nothing sent, nothing decrypted -- and no winner is
               picked: one of the two is a typo, and guessing buries it in a
               project whose notes nobody will ever see. */
            if (DECLARED_PROJECT && derived.id !== DECLARED_PROJECT) {
                showScreen(() => openTagScreen(T('tag.key_mismatch')));
                return null;
            }
            // The id is DERIVED, never declared twice: see 00-preamble.
            PROJECT = derived.id;
            PUBLIC_KEY = true;
            return startWithSalt(DECLARED_KEY, derived);
        }, () => {
            // derive() only fails when WebCrypto itself does, which is what
            // that screen is about.
            showScreen(openContextScreen);
        });
        return;
    }

    if (!PROJECT) {
        if (SETUP_REQUESTED) showScreen(openSetupScreen);
        return;
    }

    const text = readSalt(PROJECT);
    const bytes = saltFromText(text);
    if (!bytes) {
        showScreen(openSaltScreen);
        return;
    }

    derive(bytes).then((derived) => {
        if (derived.id !== PROJECT) {
            // The salt stored under this key does not derive this id: the
            // tag has changed project, or the storage was tampered with. We
            // ask again, we do not guess.
            showScreen(openSaltScreen);
            return null;
        }
        return startWithSalt(text, derived);
    }, () => {
        showScreen(openSaltScreen);
    });
};

if (document.body) {
    start();
} else {
    document.addEventListener('DOMContentLoaded', start);
}
