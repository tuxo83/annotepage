/* -- 8. The API ---------------------------------------------------------
   The contract, as the server fixed it:

     200 + application/json      normal response
     200 + JSON "active: false"  tool dropped in, not configured -> stand down
     404 + text/plain            nothing at this address -> stand down
     4xx/5xx + text/plain        message written for a human -> SHOW IT
     4xx with no readable text   FLAT REFUSAL, almost always a firewall ->
                                 name it, with its code (see below)
     anything else               PHP not executed -> stand down

   This function never rejects and never writes to the console: it returns a
   cause, and the caller decides whether we keep quiet or speak. */

/* -- 8bis. THE FORMAT THE SERVER ANNOUNCES, AND WHAT WE DO ABOUT IT ------
   The three components -- this client, the MCP package, the server -- speak
   ONE protocol number, and nothing at build time can hold them together once
   they are deployed: this file comes from a CDN, the server is updated by
   whoever runs it, on their own day. tools/check-versions.mjs makes the three
   agree IN THE REPOSITORY; it has never seen a deployment.

   So they are compared HERE, at runtime, on the only thing that crosses the
   wire: the `format` the server writes into the envelope of every answer
   (api.php, AP_FORMAT). It has been sent since format 2 and nobody read it.

   WHAT A DISAGREEMENT COSTS, AND WHY IT IS SILENT: the server accepts the
   write, stores an envelope it does not know how to read back, and the only
   symptom is a reader that quietly skips rows. Nothing fails, nothing is
   logged, and the remark is gone by the time anybody goes looking.

   THE TWO DIRECTIONS ARE NOT SYMMETRICAL, and that asymmetry IS the decision:

     SERVER NEWER THAN US -- we can guarantee nothing: neither that we read
     what is there, nor that what we write can be read back. We say it, and we
     REFUSE TO WRITE. A wrong envelope is the damage that cannot be taken
     back, because nothing is ever deleted in this tool; showing a page we may
     be reading incompletely is taken back by reloading.

     SERVER OLDER THAN US -- we still know how to read it. Format 1 rows are
     read by this client today (openNote, below), and that is exactly what the
     per-row rule buys (FORMAT.md section 7). Mention only, no refusal.

   IT IS A STATE, NOT AN ALARM. The mention is drawn in the panel at every
   draw, in the register of the public-key notice: it describes what one is
   looking AT, it is not an event that has just happened.

   EVERY DOUBT IS A SILENCE, exactly as for the announced client version
   (80-upgrade). The number comes off the network from a server we do not own:
   absent, not a number, out of shape, equal to ours -- carry on, say nothing.
   It is matched against a shape before it is compared, and it is only ever
   COMPARED: nothing here is concatenated anywhere. */

const FORMAT_SHAPE = /^(0|[1-9][0-9]{0,3})$/;

/* 0 means "nothing readable was announced", which is also the state of a
   server too old to send the field at all. Nothing is said then: a number we
   do not have is not a disagreement. */
let serverFormat = 0;

const readAnnouncedFormat = (data) => {
    if (!data || typeof data !== 'object') return;
    const announced = data.format;
    // A JSON number, as api.php sends it. A string is accepted too: an
    // intermediary that re-encodes the envelope is not a reason to go blind.
    if (typeof announced !== 'number' && typeof announced !== 'string') return;
    const text = String(announced);
    if (!FORMAT_SHAPE.test(text)) return;
    serverFormat = parseInt(text, 10);
};

/** The server speaks a format we do not: this copy must not write. */
const serverIsNewer = () => serverFormat > FORMAT;

/** The server speaks an older one: we read it, and we say so. */
const serverIsOlder = () => serverFormat > 0 && serverFormat < FORMAT;

const call = (action, body) => {
    if (!API) return Promise.resolve({ ok: false, cause: 'inactive' });

    /* THE SINGLE CHOKE POINT OF THE REFUSAL. Every write this client makes
       goes through here -- a note, a reply, a resolution, and whatever is
       added tomorrow -- and a check written at the three call sites instead
       of this one is the check the fourth call site forgets. A READ is never
       refused: what we cannot read is already counted and said (readFailure
       below), and refusing to read would hide notes rather than protect
       them. */
    if (body && serverIsNewer()) {
        return Promise.resolve({ ok: false, cause: 'format-newer' });
    }

    const options = {
        method: body ? 'POST' : 'GET',
        cache: 'no-store',
        // On a relay this means "no cookie": that is what we want. The
        // project is not a session, it is a bearer token (FORMAT.md section
        // 6.3), and the urlencoded body makes a write a "simple request" in
        // the CORS sense -- so no OPTIONS preflight.
        credentials: 'same-origin'
    };
    if (body) options.body = body;

    let address = API + (API.indexOf('?') === -1 ? '?' : '&')
        + 'action=' + encodeURIComponent(action);
    if (!body) {
        // The real path is NEVER sent, in any mode: only the blind index
        // goes out. Sending the path in plain mode and the index in
        // encrypted mode would make two code paths, and the second would be
        // the less tested one.
        address += '&project=' + encodeURIComponent(PROJECT)
            + '&index=' + encodeURIComponent(PAGE_INDEX);
    }

    return fetch(address, options)
        .then((response) => response.text().then((text) => ({ response: response, text: text })))
        .then((r) => {
            const status = r.response.status;
            const type = (r.response.headers.get('content-type') || '').toLowerCase();
            const isJson = type.indexOf('application/json') !== -1;

            if (r.response.ok && isJson) {
                let data = null;
                try {
                    data = JSON.parse(r.text);
                } catch (e) {
                    return { ok: false, cause: 'nonjson' };
                }
                /* Read from EVERY answer, not just the first: a server
                   updated while a page stayed open all afternoon says so on
                   its next answer, and the panel follows it. */
                readAnnouncedFormat(data);
                // The tool is dropped in here but not configured: it SAYS so
                // with a 200, so as not to leave the browser an error to log.
                // We stand down, as on a 404.
                if (data && data.active === false) {
                    return { ok: false, cause: 'inactive' };
                }
                return { ok: true, data: data };
            }
            if (status === 404) {
                // The tool is not configured here -- or there is nothing at
                // this address. Either way: silence.
                return { ok: false, cause: 'inactive' };
            }
            if (!r.response.ok && type.indexOf('text/plain') !== -1) {
                return { ok: false, cause: 'server', message: clip(r.text.trim(), 2000) };
            }

            /* THE FLAT REFUSAL. Seen in production: a hosting firewall
               answers 403 with an HTML page, and the client showed "the
               server answered something unexpected". That was true and
               useless -- nobody knew what to do with the sentence.

               It is not our server speaking: it is an intermediary that
               decided the request looked like an attack, often because of a
               word in the text that was typed. So we name the refusal, we
               give its code, and we suggest the one move that really gets
               around it: rephrase. The text stays in the form -- that has
               never changed and will not. */
            if (status === 413) return { ok: false, cause: 'refused-size', code: status };
            if (status === 429) return { ok: false, cause: 'refused-rate', code: status };
            if (status >= 400 && status < 500) return { ok: false, cause: 'refused', code: status };
            if (status >= 500) return { ok: false, cause: 'failure', code: status };

            // A 200 that is not JSON: PHP is not executed, the source is
            // served in the clear, or an intermediary answered.
            return { ok: false, cause: 'nonjson' };
        })
        .catch(() => ({ ok: false, cause: 'network' }));
};

/** Turns a cause into a showable failure. Returns null if there is nothing
    to say. */
const failureFrom = (result, title) => {
    if (result.ok) return null;
    const say = (key) => ({ title: T(title), detail: T(key, { code: result.code }) });
    /* Nothing left this browser. The message names BOTH numbers, because
       "incompatible" sends somebody hunting, and two numbers say in one line
       which of the two ends is behind. */
    if (result.cause === 'format-newer') {
        return { title: T(title),
                 detail: T('format.write_refused',
                           { server: serverFormat, ours: FORMAT }) };
    }
    if (result.cause === 'server') return { title: T(title), detail: result.message };
    if (result.cause === 'network') return say('error.network');
    if (result.cause === 'refused') return say('error.refused');
    if (result.cause === 'refused-size') return say('error.refused_size');
    if (result.cause === 'refused-rate') return say('error.refused_rate');
    if (result.cause === 'failure') return say('error.server_failure');
    return say('error.unexpected');
};

/* -- 9. Writing: the mode decides where the fields go --------------------
   One single place builds a request body. In plain mode the fields go out as
   they are -- exactly format 1's columns. In encrypted mode, EVERYTHING typed
   or observed goes into the envelope: encrypting the text alone would hand
   over the site's tree, the wording of its elements and the names of its
   reviewers (FORMAT.md section 2.3). */

const PAYLOAD_FIELDS = ['page', 'selector', 'fingerprint', 'excerpt',
                        'author', 'text', 'version', 'environment', 'viewport'];

const noteBody = (fields, replyTo) => {
    const body = new URLSearchParams();
    body.set('project', PROJECT);
    body.set('mode', MODE);
    if (replyTo) {
        // A reply INHERITS the page index of its parent, and in plain mode
        // its page and its element. Asking the client for them again would
        // open the door to a reply attached somewhere other than the note it
        // comments on.
        body.set('reply_to', String(replyTo));
    } else {
        body.set('index', PAGE_INDEX);
    }

    if (MODE === 'plain') {
        PAYLOAD_FIELDS.forEach((key) => {
            if (fields[key] !== undefined) body.set(key, String(fields[key]));
        });
        return Promise.resolve(body);
    }
    // The AAD uses the page index WE computed, never the one the server
    // announces: it is precisely against a server that moves a note from one
    // page to another that the AAD exists.
    return seal(keys.encryptionKey, PROJECT, PAGE_INDEX, 'note', fields)
        .then((envelope) => {
            body.set('payload', envelope);
            return body;
        });
};

const resolutionBody = (note, mark, name) => {
    const body = new URLSearchParams();
    body.set('project', PROJECT);
    body.set('id', String(note.id));
    body.set('resolved', mark ? '1' : '0');
    if (!mark) {
        // Reopening writes nothing: the server clears the resolution. We do
        // not ask for the fixer's name in order to cancel the fix.
        return Promise.resolve(body);
    }
    if (MODE === 'plain') {
        body.set('by', name);
        body.set('version', SITE_VERSION);
        return Promise.resolve(body);
    }
    // A second envelope, its own nonce, its own role: it is written by
    // another person, at another moment, often from another machine. Melting
    // it into the note's envelope would mean re-encrypting a remark we have
    // no right to rewrite.
    return seal(keys.encryptionKey, PROJECT, PAGE_INDEX, 'resolution',
                { by: name, version: SITE_VERSION })
        .then((envelope) => {
            body.set('resolution_payload', envelope);
            return body;
        });
};

/* -- 10. Reading: open what we can, count what we cannot ------------------ */

const fillFrom = (note, object) => {
    // UNKNOWN fields of the object are ignored in silence: that is what
    // makes it possible to add one some day without changing the format
    // number.
    PAYLOAD_FIELDS.forEach((key) => {
        note[key] = object[key] === undefined ? '' : String(object[key]);
    });
    return note;
};

/**
 * One row -> one readable note, or null if we cannot read it.
 * What is skipped is COUNTED: a note that disappears in silence is worse
 * than a note we announce we cannot read.
 */
const openNote = (note) => {
    if (!note || typeof note !== 'object') return Promise.resolve(null);

    // "mode" missing or empty: the row comes from format 1, it is plain.
    const m = String(note.mode || 'plain');

    if (m === 'plain') return Promise.resolve(note);

    if (m !== 'encrypted') {
        // Neither guessed, nor blanked without saying so.
        skipped.unknown += 1;
        return Promise.resolve(null);
    }

    return open(keys.encryptionKey, PROJECT, PAGE_INDEX, 'note', note.payload)
        .then(
            (object) => fillFrom(note, object),
            (e) => {
                if (e && e.reason === 'newer') skipped.newer += 1;
                else skipped.unreadable += 1;
                return null;
            }
        )
        /* THE TITLE, IN ITS OWN ENVELOPE. Forgiven like the resolution below
           it: a title that will not open costs a title, never the remark. The
           remark is the thing; the title is a label on it, written later by
           whoever answered it. */
        .then((read) => {
            if (!read || !read.title_payload) return read;
            return open(keys.encryptionKey, PROJECT, PAGE_INDEX, 'title', read.title_payload)
                .then(
                    (object) => {
                        read.title = object.title === undefined ? '' : String(object.title);
                        return read;
                    },
                    () => { read.title = ''; return read; }
                );
        })
        .then((read) => {
            if (!read || !read.resolution_payload) return read;
            return open(keys.encryptionKey, PROJECT, PAGE_INDEX, 'resolution', read.resolution_payload)
                .then(
                    (object) => {
                        read.resolved_by = object.by === undefined ? '' : String(object.by);
                        read.resolved_version = object.version === undefined ? '' : String(object.version);
                        return read;
                    },
                    () => {
                        /* The note reads, its resolution does not. We keep
                           the note: "resolved by somebody" beats nothing, and
                           the resolution date is in the clear anyway. */
                        read.resolved_by = '';
                        read.resolved_version = '';
                        return read;
                    }
                );
        });
};

/** Opens a note and its replies. A reply is a note: same role. */
const openThread = (note) =>
    openNote(note).then((parent) => {
        if (!parent) return null;
        const children = Array.isArray(parent.replies) ? parent.replies : [];
        if (!children.length) return parent;
        return Promise.all(children.map(openNote))
            .then((read) => {
                parent.replies = read.filter(Boolean);
                return parent;
            });
    });

/* WHAT THE SERVER COUNTED, TAKEN ONLY IF ALL THREE ARE THERE AND ARE NUMBERS.
   A server older than 2.5.0 sends no `totals`, and the panel shows no figures
   rather than showing zeros -- an empty project and an old server look nothing
   alike, and a tool that confuses them teaches a reviewer to distrust it. */
const readTotals = (data) => {
    const t = data && data.totals;
    if (!t || typeof t !== 'object') return null;
    const n = (v) => (typeof v === 'number' && isFinite(v) && v >= 0 ? Math.floor(v) : null);
    const notes = n(t.notes), open = n(t.open), pages = n(t.pages);
    if (notes === null || open === null || pages === null) return null;
    return { notes: notes, open: open, pages: pages };
};

const readList = (data) => {
    skipped = { newer: 0, unreadable: 0, unknown: 0 };
    const raw = data && Array.isArray(data.notes) ? data.notes : [];
    return Promise.all(raw.map(openThread)).then((read) => read.filter(Boolean));
};

/** What we could not read, said on screen. Returns null if there is nothing
    to say. */
const readFailure = () => {
    const lines = [];
    if (skipped.newer) {
        lines.push(readableCount(skipped.newer, '', 'read.newer_one', 'read.newer_n'));
    }
    if (skipped.unreadable) {
        lines.push(readableCount(skipped.unreadable, '', 'read.unreadable_one', 'read.unreadable_n'));
    }
    if (skipped.unknown) {
        lines.push(readableCount(skipped.unknown, '', 'read.unknown_one', 'read.unknown_n'));
    }
    if (!lines.length) return null;
    return { title: T('read.title_partial'), detail: lines.join('\n') };
};
