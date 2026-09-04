/* mcp-protocol.mjs — THE PROTOCOL, BY HAND, ON STANDARD INPUT AND OUTPUT.
 *
 * WHY WITH NO LIBRARY. It is a decision, not laziness, and it has a price that
 * has to be written down:
 *
 *  - this package holds THE KEY. A dependency is third-party code running in
 *    the same process as the project's only secret, and updating itself inside
 *    somebody else's dependency tree. The security decision that governs this
 *    project says the real risk of this architecture is the supply chain; we
 *    are not going to write that for the client served from a CDN and forget
 *    it for the package that holds the key;
 *  - "npm install annotepage-mcp" therefore pulls NOTHING. Zero dependencies,
 *    zero transitive, zero build step. It is the original tool speaking: "no
 *    dependency to install, nothing to compile";
 *  - THE PRICE, frankly: when the protocol moves, we are the ones who follow.
 *    This file implements the transport layer and the five methods a tool
 *    server needs, and nothing else — no resources, no prompts, no sampling.
 *    The day they are needed, this is where they get added, by hand.
 *
 * THE TRANSPORT: JSON-RPC 2.0 messages, one per line, on stdin and stdout.
 *
 * ABSOLUTE RULE OF THIS FILE: nothing other than JSON-RPC goes out on stdout.
 * A debugging "console.log" breaks the conversation in the middle of a message
 * and the assistant on the other side has no way of understanding it.
 * Everything we want to say to a human goes out on stderr.
 */

import { createInterface } from 'node:readline';

/* The protocol versions this server can hold, newest first. We answer the
   client with ITS OWN when we know it: that is what the negotiation asks, and
   systematically answering ours would drop an older client without telling it
   why. */
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const CODES = {
    parse: -32700,
    request: -32600,
    method: -32601,
    params: -32602,
    internal: -32603,
};

export const log = (...pieces) => {
    process.stderr.write('[annotepage-mcp] ' + pieces.join(' ') + '\n');
};

/**
 * Starts the loop.
 *
 * @param {object} identity  { name, version }
 * @param {Array}  tools     [{ name, title, description, schema, call }]
 */
export const serve = (identity, tools) => {
    const send = (message) => {
        process.stdout.write(JSON.stringify(message) + '\n');
    };

    const respond = (id, result) => {
        if (id === undefined || id === null) return;   // it was a notification
        send({ jsonrpc: '2.0', id, result });
    };

    const fail = (id, code, message) => {
        if (id === undefined || id === null) return;
        send({ jsonrpc: '2.0', id, error: { code, message } });
    };

    const declare = (tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.schema,
    });

    const callTool = async (id, parameters) => {
        const name = parameters && parameters.name;
        const tool = tools.find((t) => t.name === name);
        if (!tool) {
            fail(id, CODES.params,
                'Unknown tool: ' + String(name) + '. Available tools: '
                + tools.map((t) => t.name).join(', '));
            return;
        }
        try {
            const text = await tool.call(
                (parameters && parameters.arguments) || {});
            respond(id, { content: [{ type: 'text', text }] });
        } catch (e) {
            /* A TOOL FAILURE IS NOT A PROTOCOL FAILURE. We return a result
               marked "isError", and not a JSON-RPC error: the message is
               written to be read by the assistant, which must be able to fix
               it and start again. A protocol error, on the other hand, stops
               the conversation.

               The PHP server's message arrives here exactly as it wrote it.
               Replacing it with "error 400" would throw away the only useful
               information — that is already the client's rule. */
            respond(id, {
                content: [{ type: 'text', text: (e && e.message) || String(e) }],
                isError: true,
            });
        }
    };

    const handle = async (message) => {
        if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
            fail(message && message.id, CODES.request,
                'A JSON-RPC 2.0 message was expected.');
            return;
        }

        const { id, method, params } = message;

        switch (method) {
            case 'initialize': {
                const asked = params && params.protocolVersion;
                respond(id, {
                    protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
                    capabilities: { tools: { listChanged: false } },
                    serverInfo: identity,
                });
                return;
            }
            case 'notifications/initialized':
            case 'notifications/cancelled':
                return;                      // notifications: nothing to answer
            case 'ping':
                respond(id, {});
                return;
            case 'tools/list':
                respond(id, { tools: tools.map(declare) });
                return;
            case 'tools/call':
                await callTool(id, params);
                return;
            default:
                if (method.startsWith('notifications/')) return;
                fail(id, CODES.method, 'Method not implemented: ' + method);
        }
    };

    const reader = createInterface({ input: process.stdin });

    /* Messages are handled ONE AFTER THE OTHER, never in parallel. Two
       simultaneous writes on the same project would produce two notes where
       the assistant wanted one, and nothing is ever erased in this tool. The
       slowness paid is the network's, on a tool a human is waiting for
       anyway. */
    let queue = Promise.resolve();

    reader.on('line', (line) => {
        const raw = line.trim();
        if (raw === '') return;
        let message;
        try {
            message = JSON.parse(raw);
        } catch (e) {
            send({ jsonrpc: '2.0', id: null,
                   error: { code: CODES.parse, message: 'Invalid JSON.' } });
            return;
        }
        queue = queue.then(() => handle(message)).catch((e) => {
            log('internal failure:', (e && e.stack) || String(e));
            fail(message.id, CODES.internal, (e && e.message) || String(e));
        });
    });

    reader.on('close', () => {
        /* The assistant has closed the pipe: there is nobody left to talk to.
           We exit when the queue is empty, NEVER right away — a write request
           in flight would be abandoned halfway, and the caller would not know
           whether the note was saved. That is exactly the doubt we refuse
           everywhere else in this tool. */
        queue.then(() => process.exit(0), () => process.exit(1));
    });
};
