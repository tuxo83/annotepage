/*
 * http.js -- turning a web-standard Request into the fields the handler reads,
 * and the handler's answers into web-standard Responses.
 *
 * This is the whole of the module's dependency on a transport: everything else
 * works in plain data. The core speaks the Fetch API's Request and Response,
 * which Node (>= 18), Deno, Bun and the edge runtimes all provide, so no
 * framework is imposed and the adapters are thin.
 */

import { Params } from './input.js';

// The five characters escaped in a JSON response. They only ever occur INSIDE
// a string value -- never as a JSON delimiter -- so a global replace is safe,
// and it keeps a response harmless if something ever drops it into an HTML page
// or a <script>. < > & are the PHP's JSON_HEX_* flags; U+2028 and U+2029 are
// the two line separators that are invisible and break a JavaScript string
// literal, built here from their code points so no separator sits in this
// source (a regex literal cannot contain one).
const ESCAPE = new RegExp('[<>&' + String.fromCharCode(0x2028, 0x2029) + ']', 'g');

/**
 * JSON for the wire. JSON.stringify already leaves slashes and non-ASCII as
 * they are (the PHP's JSON_UNESCAPED_SLASHES and JSON_UNESCAPED_UNICODE).
 */
export function encodeJson(payload) {
    return JSON.stringify(payload).replace(ESCAPE,
        (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase());
}

/** Headers common to ALL responses, errors included. `cors` is a list of
 *  [name, value] pairs the domain lock computed, empty until an origin is
 *  verified. */
function commonHeaders(config, contentType, cors = []) {
    const h = new Headers();
    h.set('Content-Type', contentType);
    // Without no-store a cache in front could serve one reviewer's list to
    // another, or a stale one back to a reviewer.
    h.set('Cache-Control', 'no-store');
    h.set('X-Robots-Tag', 'noindex, nofollow');
    h.set('X-Content-Type-Options', 'nosniff');
    if (config.mcpVersion && config.mcpVersion !== 'unknown') {
        h.set('X-Annotepage-Mcp-Version', config.mcpVersion);
    }
    for (const [name, value] of cors) {
        h.set(name, value);
    }
    return h;
}

export function jsonResponse(config, payload, { status = 200, cors = [] } = {}) {
    return new Response(encodeJson(payload), {
        status,
        headers: commonHeaders(config, 'application/json; charset=utf-8', cors),
    });
}

export function textResponse(config, body, { status = 200, cors = [], retryAfter = null } = {}) {
    const headers = commonHeaders(config, 'text/plain; charset=utf-8', cors);
    if (retryAfter !== null) {
        headers.set('Retry-After', String(retryAfter));
    }
    return new Response(body, { status, headers });
}

/**
 * Reads a Request into what the router needs:
 *   - `action` and `token` come from the query string ALWAYS, even on a POST,
 *     exactly as the PHP reads $_GET['action'] regardless of method;
 *   - the field source follows the METHOD: a POST reads its urlencoded body, a
 *     GET reads the query string. That is why a write is a POST and a read a
 *     GET, and why there is no OPTIONS here -- an urlencoded body is a CORS
 *     "simple request" and triggers no preflight.
 *   - `origin` is the browser's Origin header, for the domain lock.
 *
 * @param {Request} request
 */
export async function readRequest(request) {
    const url = new URL(request.url);
    const method = (request.method || 'GET').toUpperCase();
    const action = (url.searchParams.get('action') || '').toLowerCase().trim();
    const token = url.searchParams.get('token') || '';

    let source;
    if (method === 'POST') {
        // PHP fills $_POST only for an urlencoded or multipart body, which is
        // what the client sends. Anything else parses to no fields, and the
        // required-field checks then answer the 400 that names what is missing.
        const body = await request.text();
        source = new URLSearchParams(body);
    } else {
        source = url.searchParams;
    }

    return {
        url,
        method,
        action,
        token,
        params: new Params(source),
        origin: request.headers.get('origin'),
        contentLength: Number(request.headers.get('content-length') || 0),
        // Kept for the bounds: a configured client-IP header is read from here.
        headers: request.headers,
    };
}
