/*
 * adapters.js -- OPTIONAL glue to the common server shapes.
 *
 * The module's real interface is `api.fetch(request)`: a web-standard Request
 * in, a Response out. These adapters are a convenience for hosts whose
 * framework speaks Node's own req/res instead, and nothing here is required --
 * on Deno, Bun, Cloudflare Workers or Node's own fetch servers you hand
 * `api.fetch` straight to the runtime.
 *
 * The one thing an adapter must supply that a Request cannot carry is the
 * CLIENT ADDRESS, for rate limiting: it is read from the connection (`req.ip`
 * behind Express's trust-proxy, else the socket), and passed as `info.address`.
 * A proxy header is still only trusted when the host named it in
 * `clientIpHeader` -- the adapter never guesses one.
 */

/** Builds a web Request from a Node IncomingMessage. The scheme and host do
 *  not matter -- the handler reads only the query string and the headers -- so
 *  a placeholder host is fine when none is sent. */
export function toWebRequest(req, bodyString) {
    const host = req.headers.host || 'annotepage.local';
    const url = 'http://' + host + (req.url || '/');
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) {
            for (const v of value) {
                headers.append(name, v);
            }
        } else if (value != null) {
            headers.set(name, value);
        }
    }
    const method = (req.method || 'GET').toUpperCase();
    const init = { method, headers };
    if (method !== 'GET' && method !== 'HEAD' && bodyString != null) {
        init.body = bodyString;
    }
    return new Request(url, init);
}

/** Writes a web Response to a Node ServerResponse. */
export async function sendWebResponse(res, webRes) {
    res.statusCode = webRes.status;
    webRes.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(await webRes.text());
}

/** An already-parsed body object (Express's req.body, Fastify's request.body)
 *  turned back into an urlencoded string, so the handler reads the same fields
 *  whether or not a body parser ran before us. */
function bodyFromParsed(obj) {
    const p = new URLSearchParams();
    for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value)) {
            for (const v of value) {
                p.append(key, String(v));
            }
        } else {
            p.append(key, String(value));
        }
    }
    return p.toString();
}

async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
}

/**
 * A Node request listener for `http.createServer`, and equally a Connect or
 * Express middleware (Express's req/res ARE Node's). Mount it where your app
 * routes annotepage; it reads the body whether or not a parser ran first.
 *
 *   http.createServer(nodeListener(api)).listen(3000);
 *   app.use('/annotepage/api', nodeListener(api));   // Express
 *
 * @param {{ fetch: Function }} api from createServer()
 */
export function nodeListener(api) {
    return async function listener(req, res) {
        try {
            const method = (req.method || 'GET').toUpperCase();
            let bodyString;
            if (method !== 'GET' && method !== 'HEAD') {
                bodyString = req.body && typeof req.body === 'object'
                    ? bodyFromParsed(req.body)
                    : await readBody(req);
            }
            const request = toWebRequest(req, bodyString);
            const address = req.ip || (req.socket && req.socket.remoteAddress) || undefined;
            const webRes = await api.fetch(request, { address });
            await sendWebResponse(res, webRes);
        } catch (e) {
            if (!res.headersSent) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            }
            res.end('An unexpected error occurred.\n');
        }
    };
}

/**
 * A Fastify plugin. Register it under a prefix:
 *
 *   await fastify.register(fastifyPlugin(api), { prefix: '/annotepage/api' });
 *
 * It installs a passthrough parser for urlencoded bodies so the raw fields
 * reach the handler, and routes every method and path under the prefix.
 *
 * @param {{ fetch: Function }} api from createServer()
 */
export function fastifyPlugin(api) {
    return async function plugin(fastify) {
        // Leave the urlencoded body as a string; the handler parses it.
        if (!fastify.hasContentTypeParser('application/x-www-form-urlencoded')) {
            fastify.addContentTypeParser('application/x-www-form-urlencoded',
                { parseAs: 'string' }, (request, body, done) => done(null, body));
        }
        fastify.route({
            method: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'],
            url: '/*',
            handler: async (request, reply) => {
                const req = request.raw;
                const method = (req.method || 'GET').toUpperCase();
                let bodyString;
                if (method !== 'GET' && method !== 'HEAD') {
                    bodyString = typeof request.body === 'string'
                        ? request.body
                        : (request.body && typeof request.body === 'object'
                            ? bodyFromParsed(request.body)
                            : await readBody(req));
                }
                const webRes = await api.fetch(toWebRequest(req, bodyString), { address: request.ip });
                reply.code(webRes.status);
                webRes.headers.forEach((value, name) => reply.header(name, value));
                reply.send(await webRes.text());
            },
        });
    };
}
