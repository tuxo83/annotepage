/*
 * handler.js -- the single entry point, ported from api.php.
 *
 * One function takes a web-standard Request and returns a Response. It is the
 * only part of the module the web reaches; everything under it works in plain
 * data and never sees a socket. The six service actions are here -- list, add,
 * resolve, title, text, diagnostic -- each doing exactly what the PHP does, in
 * the same order, with the same refusals.
 *
 * WHAT IS NOT PORTED, and why:
 *   - the `update` action (fetch and install the server's own code): an
 *     embedded module is updated by `npm update`, not by writing its own files.
 *     An `update` request is answered as an unknown action, like the PHP
 *     answers one whose token is absent.
 *   - the https redirect: TLS is terminated by the host app or its proxy, and
 *     the module may be mounted under a subpath. Forcing a 308 here would fight
 *     the host.
 *   - the "dropped in but not configured" silence of a copied-in directory:
 *     mounting this module IS configuring it. An unknown PROJECT still answers
 *     the same {ok:false, active:false} silence on `list`.
 *
 * THE BOUNDS -- the domain lock, rate limiting, body cap, project caps -- are
 * injected. The default here enforces none of them; the real ones arrive with
 * the bounds module and are passed in by createServer. The call sites are here
 * so that porting them is filling a function in, not threading a new argument
 * through the router.
 */

import { ApFailure } from './errors.js';
import { AP_FORMAT, AP_LEN_RESOLUTION_PAYLOAD, AP_LEN_TITLE, AP_LEN_TITLE_PAYLOAD, AP_LEN_AUTHOR, AP_LEN_VERSION } from './constants.js';
import { projectFor } from './config.js';
import { readRequest, jsonResponse, textResponse } from './http.js';
import { writeDiagnostic } from './diagnostic.js';
import {
    fieldProject, fieldIndex, fieldId, fieldFlag, fieldMode, fieldEnvelope,
    field, rejectField, noteFromRequest, readableExcerpt, shortProject,
} from './input.js';

const KNOWN_ACTIONS = ['list', 'add', 'resolve', 'title', 'text', 'diagnostic'];

/** Bounds that enforce nothing: the permissive default until the real bounds
 *  module is passed in. Each call site matches a line of api.php. */
const OPEN_BOUNDS = {
    checkBodySize() {},
    applyOriginLock() { return []; },   // no CORS header, nothing refused
    applyRateLimit() {},
    checkNoteCap() {},
};

/** The refusal an unknown action gets: 400 and the list of the real ones, never
 *  an empty body -- whoever got the address wrong must read what to write. */
function unknownActionFailure(action) {
    return new ApFailure(
        (action === '' ? 'No action requested.' : 'Unknown action: ' + readableExcerpt(action) + '.')
        + '\nAvailable actions:\n'
        + '  ?action=list&project=<id>&index=<index>  the notes of a page (JSON)\n'
        + '  ?action=add                              write a note (POST)\n'
        + '  ?action=resolve                          mark resolved (POST)\n'
        + '  ?action=title                            title a note (POST)\n'
        + '  ?action=text&project=<id>                every note (plain text)\n'
        + '  ?action=diagnostic                       state of the server (plain text)',
        400);
}

/** The common envelope of every JSON service response. `client_version` is
 *  present only when known: the client reads an absent field as silence. */
function responseEnvelope(config, extra) {
    const envelope = {
        ok: true,
        tool: 'annotepage',
        format: AP_FORMAT,
        version: config.version,
    };
    if (config.clientVersion && config.clientVersion !== 'unknown') {
        envelope.client_version = config.clientVersion;
    }
    return { ...envelope, ...extra };
}

function requirePost(method, what) {
    if (method !== 'POST') {
        throw new ApFailure(
            what + ' is done with POST. Method received: '
            + method.replace(/[^A-Za-z]/g, '') + '.', 405);
    }
}

/**
 * Builds the request handler.
 *
 * @param {object} config normalised configuration (see config.js)
 * @param {object} store the store (see store-sqlite.js)
 * @param {object} [deps] injected pieces: `bounds`, `writeTextExport`,
 *   `statistics` (world + schedule), `log`
 * @returns {(request: Request, info?: { address?: string }) => Promise<Response>}
 */
export function createHandler(config, store, deps = {}) {
    const bounds = deps.bounds || OPEN_BOUNDS;
    const log = typeof deps.log === 'function' ? deps.log : () => {};

    return async function handle(request, info = {}) {
        let cors = [];
        try {
            const req = await readRequest(request);
            const { action, method, params, origin, contentLength } = req;

            if (!KNOWN_ACTIONS.includes(action)) {
                throw unknownActionFailure(action);
            }

            // The diagnostic ALWAYS answers (except when switched off, where it
            // does not exist): it is what one questions when nothing else does.
            // No origin lock, no project, never a note.
            if (action === 'diagnostic') {
                if (config.diagnostic === 'off') {
                    throw unknownActionFailure(action);
                }
                return textResponse(config, writeDiagnostic(config, store, config.diagnostic));
            }

            // The body cap is the only refusal that costs less than the request
            // it refuses, so it comes first.
            bounds.checkBodySize({ config, contentLength, method });

            // Mounted is active; an explicit active:false restores the silence.
            if (!config.active) {
                if (action === 'list') {
                    return jsonResponse(config, inactive(config,
                        'annotepage is inactive on this server.'));
                }
                throw new ApFailure('annotepage is inactive on this server.', 404);
            }

            // THE PROJECT, FIRST: it decides which origins are admitted, which
            // mode is accepted, which rows are visible.
            const id = fieldProject(params, 'project');
            const project = projectFor(config, id);
            if (project === null) {
                // Unknown project: `list` keeps quiet, the others explain. The
                // leak is nil -- the id is a bearer token; whoever has it can
                // already read the rows, whoever guesses 128 bits learns nothing.
                if (action === 'list') {
                    return jsonResponse(config, inactive(config, 'Project unknown to this server.'));
                }
                throw new ApFailure(
                    'Project unknown to this server: ' + shortProject(id) + '\n'
                    + 'Declare it in the server configuration, with its origins.', 404);
            }

            // THE DOMAIN LOCK. Anti-abuse, nothing else. Returns the CORS
            // headers to echo, or throws 403.
            const isWrite = action === 'add' || action === 'resolve' || action === 'title';
            cors = bounds.applyOriginLock({ config, id, project, isWrite, origin });

            // Rate limiting needs the client address, which a Request does not
            // carry: the adapter passes it in `info.address`, and a configured
            // header (behind a proxy) is read from the request headers.
            const rate = (kind) => bounds.applyRateLimit({
                config, store, id, kind, headers: req.headers, address: info.address,
            });

            // RETENTION, opportunistically, on writes only, and it cannot cost a
            // note: expireOlderThan swallows its own errors. Running before the
            // write also means the note just saved is never a candidate.
            if (isWrite && config.maxNoteAgeDays > 0 && Math.floor(Math.random() * 50) === 0
                && typeof store.expireOlderThan === 'function') {
                store.expireOlderThan(config.maxNoteAgeDays);
            }

            let response;
            switch (action) {
                case 'list':
                    response = listAction(config, store, rate, deps, params, id, cors); break;
                case 'add':
                    response = addAction(config, store, bounds, rate, params, id, project, method, cors); break;
                case 'resolve':
                    response = resolveAction(config, store, rate, params, id, method, cors); break;
                case 'title':
                    response = titleAction(config, store, rate, params, id, method, cors); break;
                case 'text':
                    response = textAction(config, store, rate, deps, id, cors); break;
                default:
                    throw unknownActionFailure(action);
            }

            // THE DAY'S STATISTICS, on a successful write only, after the answer
            // is built and NEVER awaited: a report must not stand between a
            // visitor and their note. Off unless the host opted in (see config).
            if (isWrite && response.status === 200
                && deps.statistics && typeof deps.statistics.report === 'function') {
                deps.statistics.report(config, store);
            }
            return response;
        } catch (err) {
            if (err instanceof ApFailure) {
                return textResponse(config, err.message + '\n', {
                    status: err.status,
                    cors,
                    retryAfter: err.retryAfter ?? null,
                });
            }
            log('unexpected error : ' + (err && err.stack ? err.stack : err));
            return textResponse(config,
                'An unexpected error occurred. No note was saved.\n', { status: 500, cors });
        }
    };
}

/** The {ok:false, active:false} silence a `list` answers. */
function inactive(config, message) {
    return {
        ok: false,
        active: false,
        tool: 'annotepage',
        format: AP_FORMAT,
        version: config.version,
        message,
    };
}

function listAction(config, store, rate, deps, params, id, cors) {
    rate('read');
    const index = fieldIndex(params, 'index', true);
    const payload = {
        project: id,
        index,
        notes: store.byPage(id, index),
        totals: store.projectTotals(id),
        expired: typeof store.expiredTotals === 'function' ? store.expiredTotals(id) : null,
        retention: config.maxNoteAgeDays,
    };
    if (config.publishServerTotals && typeof store.serverTotals === 'function') {
        const server = store.serverTotals();
        if (server !== null) {
            payload.server = server;
        }
    }
    if (deps.statistics && typeof deps.statistics.world === 'function') {
        const world = deps.statistics.world(config, store);
        if (world !== null && world !== undefined) {
            payload.world = world;
        }
    }
    return jsonResponse(config, responseEnvelope(config, payload), { cors });
}

function addAction(config, store, bounds, rate, params, id, project, method, cors) {
    requirePost(method, 'Writing a note');
    rate('write');
    bounds.checkNoteCap({ config, store, id });
    const mode = fieldMode(params, config.allowPlainMode, id, project);
    const note = noteFromRequest(params, config.allowPlainMode, store, id, mode);
    return jsonResponse(config, responseEnvelope(config, {
        project: id,
        note: store.add(note),
    }), { cors });
}

function resolveAction(config, store, rate, params, id, method, cors) {
    requirePost(method, 'Resolving a note');
    rate('write');
    const noteId = fieldId(params, 'id', 'id');
    const target = store.note(noteId, id);
    if (target === null) {
        throw new ApFailure('Note not found in this project: ' + noteId + '.', 404);
    }
    // THE MODE COMES FROM THE NOTE, not the request: a resolution attaches to a
    // note whose mode was fixed the day it was written.
    const mode = target.mode;
    if (mode !== 'plain' && mode !== 'encrypted') {
        throw new ApFailure(
            'This note carries a mode that this version of annotepage does not know.\n'
            + 'It was not modified.', 400);
    }
    const resolved = fieldFlag(params, 'resolved', true, 'resolved');

    let by = '';
    let fixVersion = '';
    let resolutionPayload = '';
    if (mode === 'encrypted') {
        resolutionPayload = fieldEnvelope(params, 'resolution_payload',
            AP_LEN_RESOLUTION_PAYLOAD, resolved, 'resolution_payload');
        rejectField(params, 'by', 'by',
            "this project is in encrypted mode, and the fixer's name would travel in "
            + 'the clear to the server.');
        rejectField(params, 'version', 'version',
            'this project is in encrypted mode, and the version of the fix would '
            + 'travel in the clear to the server.');
    } else {
        // The name is required only to MARK a fix -- it signs it. To reopen, it
        // is not asked for: we do not ask the fixer's name to cancel the fix.
        by = field(params, 'by', AP_LEN_AUTHOR, resolved, 'by');
        fixVersion = field(params, 'version', AP_LEN_VERSION, false, 'version');
    }

    return jsonResponse(config, responseEnvelope(config, {
        project: id,
        note: store.resolve(noteId, id, by, fixVersion, resolutionPayload, resolved),
    }), { cors });
}

function titleAction(config, store, rate, params, id, method, cors) {
    requirePost(method, 'Titling a note');
    rate('write');
    const noteId = fieldId(params, 'id', 'id');
    const target = store.note(noteId, id);
    if (target === null) {
        throw new ApFailure('Note not found in this project: ' + noteId + '.', 404);
    }
    const mode = target.mode;
    if (mode !== 'plain' && mode !== 'encrypted') {
        throw new ApFailure(
            'This note carries a mode that this version of annotepage does not know.\n'
            + 'It was not modified.', 400);
    }

    let title = '';
    let titlePayload = '';
    if (mode === 'encrypted') {
        titlePayload = fieldEnvelope(params, 'title_payload', AP_LEN_TITLE_PAYLOAD, false, 'title_payload');
        rejectField(params, 'title', 'title',
            'this project is in encrypted mode, and the title would travel in the '
            + 'clear to the server.');
    } else {
        title = field(params, 'title', AP_LEN_TITLE, false, 'title');
    }

    return jsonResponse(config, responseEnvelope(config, {
        project: id,
        note: store.setTitle(noteId, id, title, titlePayload),
    }), { cors });
}

function textAction(config, store, rate, deps, id, cors) {
    rate('export');
    if (typeof deps.writeTextExport !== 'function') {
        // The text export is the next batch (B4 -- export texte). Until it is
        // wired, this address says so rather than answer a half-grammar.
        throw new ApFailure(
            'The text export is not available in this build yet.', 503);
    }
    const body = deps.writeTextExport({ config, store, id });
    return textResponse(config, body, { cors });
}
