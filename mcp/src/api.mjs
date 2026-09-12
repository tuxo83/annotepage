/* api.mjs — THE FIVE ADDRESSES, SEEN FROM THIS SIDE.
 *
 * The PHP server is the same code deployed in two places, and this file does
 * not tell the difference: it is a URL, five actions, and a response contract.
 * All the knowledge of the deployment fits in one optional Origin header.
 *
 * TWO THINGS NOT TO UNDO:
 *
 *  1. THE BODY OF A WRITE STAYS x-www-form-urlencoded. Moving to JSON would be
 *     cleaner to read and would turn every write into an OPTIONS preflight on
 *     the browser side. The client and this package talk to the SAME entry
 *     point: a JSON body accepted here would end up accepted there, and the
 *     relay would gain a whole OPTIONS machinery for nothing.
 *
 *  2. THE SERVER'S ERROR MESSAGE IS PASSED THROUGH AS IT IS. It is written for
 *     a human — "the database is unreachable", "the envelope is 24512
 *     characters, the limit is 24000". Replacing it with "error 400" throws
 *     away the only useful information. That is already the client's rule.
 */

export class ApiError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}

const address = (api, parameters) => {
    const url = new URL(api);
    for (const [key, value] of Object.entries(parameters)) {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, String(value));
        }
    }
    return url.toString();
};

/* WHETHER THIS COPY IS BEHIND, AS THE SERVER SEES IT (FORMAT.md, the
   X-Annotepage-Mcp-Version header). `npx annotepage-mcp` runs a copy installed
   on the machine in preference to the published one, without checking, so a
   copy months old answers and nobody knows. The server knows the release it
   ships with; this compares.
   It announces and never gates: absent, malformed, equal or older is silence,
   and a newer one is reported ONCE per process, through whatever the entry
   point registered -- stderr for the command line, the tool's text for MCP. */
const VERSION_SHAPE = /^(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})$/;
const versionWatch = { own: null, report: null, said: false };

export const watchVersion = (own, report) => {
    versionWatch.own = own;
    versionWatch.report = report;
};

export const isNewerVersion = (announced, own) => {
    if (typeof announced !== 'string' || typeof own !== 'string') return false;
    const a = announced.trim().match(VERSION_SHAPE);
    const b = own.trim().match(VERSION_SHAPE);
    if (!a || !b) return false;
    for (let i = 1; i <= 3; i += 1) {
        if (Number(a[i]) !== Number(b[i])) return Number(a[i]) > Number(b[i]);
    }
    return false;
};

export const newerVersionNotice = (announced, own) =>
    'annotepage-mcp ' + announced + ' is published, and this copy is ' + own + '.\n'
    + 'Update it: npm install -g annotepage-mcp@latest\n'
    + 'or run the latest without installing: npx -y -p annotepage-mcp@latest annotepage';

const noticeVersion = (response) => {
    if (versionWatch.said || !versionWatch.report) return;
    const announced = response.headers.get('x-annotepage-mcp-version');
    if (!isNewerVersion(announced, versionWatch.own)) return;
    versionWatch.said = true;
    versionWatch.report(newerVersionNotice(announced.trim(), versionWatch.own));
};

const headers = (project, extra) => {
    const all = Object.assign({
        /* The agent names the tool and its version, and never names the
           project. A relay operator reading its logs must be able to tell an
           assistant from a browser: it is their quota and their bandwidth. */
        'User-Agent': 'annotepage-mcp',
        'Accept': 'text/plain, application/json',
    }, extra || {});
    if (project.origin) all.Origin = project.origin;
    return all;
};

/**
 * One request, and the reading of its result.
 *
 * The response contract is api.php's: 200 + JSON, 200 + JSON with
 * active=false, 4xx/5xx + text/plain written for a human, or anything else
 * when PHP is not executed.
 */
const request = async (project, url, options) => {
    let response;
    try {
        response = await fetch(url, options);
    } catch (e) {
        throw new ApiError(
            'The server ' + new URL(project.api).origin + ' did not answer: '
            + (e && e.message ? e.message : String(e)), 0);
    }

    noticeVersion(response);
    const type = String(response.headers.get('content-type') || '');
    const body = await response.text();

    if (!response.ok) {
        /* 429 carries Retry-After; copying it saves the assistant from asking
           again at once and burning the quota it has just hit. */
        const wait = response.headers.get('retry-after');
        throw new ApiError(
            (body.trim() !== '' ? body.trim()
                : 'The server answered ' + response.status + ' and explained nothing.')
            + (wait ? '\nTry again in ' + wait + ' seconds.' : ''),
            response.status);
    }

    if (type.includes('application/json')) {
        let object;
        try {
            object = JSON.parse(body);
        } catch (e) {
            throw new ApiError(
                'The server announced JSON and did not send any. '
                + 'PHP is perhaps not executed at this address.', 200);
        }
        if (object && object.ok === false && object.active === false) {
            /* The silence of the contract: the tool is dropped in but not
               configured, or the project is not declared. The client stands
               down without a word; we speak — nobody calls this package by
               accident. */
            throw new ApiError(
                (object.message ? object.message + '\n' : '')
                + 'This server does not know this project, or annotepage is not '
                + 'configured on it.\nProject asked for: ' + project.id
                + '\nCheck ?action=diagnostic on the server.', 200);
        }
        return { json: object, text: body };
    }

    return { json: null, text: body };
};

/** GET ?action=text — the export. It is our only source for reading. */
export const readRawExport = async (project, signal) => {
    const url = address(project.api, { action: 'text', project: project.id });
    const { text } = await request(project, url, {
        method: 'GET', headers: headers(project), signal,
        redirect: 'error',
    });
    return text;
};

/** GET ?action=diagnostic — the state of the server. No project, no notes. */
export const readDiagnostic = async (project, signal) => {
    const url = address(project.api, { action: 'diagnostic' });
    const { text } = await request(project, url, {
        method: 'GET', headers: headers(project), signal, redirect: 'error',
    });
    return text;
};

const post = async (project, action, fields, signal) => {
    const body = new URLSearchParams();
    body.set('project', project.id);
    for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined && value !== null) body.set(key, String(value));
    }
    const url = address(project.api, { action });
    const { json } = await request(project, url, {
        method: 'POST',
        headers: headers(project, { 'Content-Type': 'application/x-www-form-urlencoded' }),
        body: body.toString(),
        signal,
        /* A redirect on a write loses the body in POST and replays it as GET:
           the server would refuse, or worse, accept it somewhere else. */
        redirect: 'error',
    });
    if (!json || json.ok !== true) {
        throw new ApiError(
            'The server accepted the request without confirming the write. '
            + 'The note may not have been saved.', 200);
    }
    return json;
};

/** POST ?action=add — a new note, or a reply. */
export const add = (project, fields, signal) => post(project, 'add', fields, signal);

/** POST ?action=resolve — mark resolved, or reopen. */
export const resolve = (project, fields, signal) => post(project, 'resolve', fields, signal);

/** POST ?action=title — what a remark is about, in one line. */
export const title = (project, fields, signal) => post(project, 'title', fields, signal);

/**
 * A cache of a few seconds on the export, per project.
 *
 * FORMAT.md section 8.5 leaves the pagination of ?action=text open: the
 * address returns EVERYTHING. An assistant that lists the open notes then
 * reads three of them would make four complete exports in a row, for identical
 * content.
 *
 * The duration is short ON PURPOSE, and every write empties it: a note just
 * written must reappear immediately, or the assistant rewrites it believing it
 * failed — and nothing is ever erased in this tool.
 */
const cache = new Map();
export const CACHE_TTL = 10 * 1000;

export const readCachedExport = async (project, signal) => {
    const entry = cache.get(project.id);
    if (entry && Date.now() - entry.when < CACHE_TTL) return entry.text;
    const text = await readRawExport(project, signal);
    cache.set(project.id, { when: Date.now(), text });
    return text;
};

export const forgetCache = (project) => { cache.delete(project.id); };

export const readableCacheTtl = () => Math.round(CACHE_TTL / 1000) + ' seconds';
