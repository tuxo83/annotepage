/*
 * bounds.js -- RATE LIMITING, SIZE CAPS AND THE DOMAIN LOCK POLICY, ported from
 * rate-limit.php and the applying half of origins.php.
 *
 * This file holds the POLICY -- what is refused and with which message. The
 * counting itself is in the store (consumeRate), the only thing that talks to
 * the database, and the origin SHAPES are in origins.js. The split is the PHP's
 * and is not decorative: it lets one change what is limited without touching
 * how it is counted.
 *
 * Everything here is OFF by default. A server that asked for no limit pays for
 * none: a zero window or a zero cap touches no counter, and a page load still
 * costs no database write.
 *
 * WHEN THE COUNTER ITSELF IS BROKEN, the rule decides by what there is to lose:
 * a relay refuses the write (a relay with no counter will be filled), a
 * self-hosted server lets it through and logs it (the notes are behind the same
 * door as the site, and a manufactured outage is worse than the risk). The
 * question is the same the Origin rule asks: is this the site, or is it holding
 * someone else's notes -- `requireOriginOnWrites` answers it.
 */

import { createHash } from 'node:crypto';

import { ApFailure } from './errors.js';
import { shortProject, readableExcerpt } from './input.js';
import { requestOrigin, originAllowed } from './origins.js';

/** A counting key: a digest, never the address itself. NOT anonymisation (the
 *  IPv4 space is enumerated in minutes) -- hygiene: the notes database has no
 *  reason to hold a second list of who annotates. */
function rateKey(scope, value) {
    return scope + ':' + createHash('sha256').update(String(value)).digest('hex').slice(0, 40);
}

/** The client's address, as this server can know it. The socket address by
 *  default; a configured header only when the operator declared one -- a header
 *  the client writes itself makes the limit bypassable in one line. */
function clientAddress(config, headers, socketAddress) {
    if (config.clientIpHeader && headers) {
        const raw = headers.get(config.clientIpHeader);
        if (typeof raw === 'string' && raw !== '') {
            // X-Forwarded-For carries a list; the first entry is the original
            // client as the proxy saw it.
            const first = raw.split(',')[0].trim();
            if (first !== '') {
                return first;
            }
        }
    }
    return socketAddress || 'unknown';
}

/**
 * @param {object} [options] `{ log }` -- log is called with one string when a
 *   counter is unavailable; it defaults to doing nothing.
 */
export function createBounds(options = {}) {
    const log = typeof options.log === 'function' ? options.log : () => {};

    return {
        /** Body cap on Content-Length, before any field is read: the only
         *  refusal that costs less than the request it refuses. */
        checkBodySize({ config, contentLength }) {
            const cap = config.maxBodyBytes;
            if (cap <= 0 || !contentLength) {
                return;
            }
            if (contentLength > cap) {
                throw new ApFailure(
                    'The request body is ' + contentLength + ' bytes; the limit is '
                    + cap + '.\nNothing was saved.', 413);
            }
        },

        /** The domain lock. Returns the CORS headers to echo ([] when there is
         *  nothing to share), or throws 403. */
        applyOriginLock({ config, id, project, isWrite, origin }) {
            const o = requestOrigin(origin);
            if (o === null) {
                if (config.requireOriginOnWrites && isWrite) {
                    throw new ApFailure(
                        'Write refused: the request carries no Origin header.\n'
                        + 'This server requires one on a write: a write reaching it comes '
                        + 'from another domain, and a browser always attaches that header.\n'
                        + 'A request with no Origin does not come from a page: it is refused.',
                        403);
                }
                // Nothing to share: no Origin, no boundary to cross.
                return [];
            }
            // A project admitted by open registration declares no origin and
            // cannot. The header is still required on a write (above); what is
            // dropped is the comparison against a list that does not exist.
            if (project.origins === null) {
                return [['Access-Control-Allow-Origin', o], ['Vary', 'Origin']];
            }
            if (!originAllowed(o, project.origins)) {
                throw new ApFailure(
                    'Origin refused for project ' + shortProject(id) + '.\n'
                    + 'Origin of the request: ' + readableExcerpt(o) + '\n'
                    + 'This project does not declare that origin in the server configuration.\n'
                    + 'This lock is an anti-abuse measure: it stops another site from '
                    + 'consuming this project id. It is NOT a protection against XSS.', 403);
            }
            // Handed to error responses as well, so a failure crosses the origin
            // boundary: an error the browser hides is a silent failure.
            return [['Access-Control-Allow-Origin', o], ['Vary', 'Origin']];
        },

        /** Rate limiting for a kind of action: 'write', 'read' or 'export'. */
        applyRateLimit({ config, store, id, kind, headers, address }) {
            const duration = config.rateWindowSeconds;
            if (duration <= 0) {
                return;
            }
            const window = Math.floor(Date.now() / 1000 / duration);
            const addr = clientAddress(config, headers, address);

            let limits;
            if (kind === 'write') {
                limits = [
                    ['ip', rateKey('w-ip', addr), config.rateWritesPerIp,
                        'too many writes from this machine'],
                    ['project', rateKey('w-pr', id), config.rateWritesPerProject,
                        'too many writes on this project'],
                ];
            } else if (kind === 'read') {
                limits = [
                    ['ip', rateKey('r-ip', addr), config.rateReadsPerIp,
                        'too many page loads from this machine'],
                ];
            } else {
                limits = [
                    ['ip', rateKey('x-ip', addr), config.rateExportsPerIp,
                        'too many exports requested from this machine'],
                ];
            }

            for (const [scope, key, cap, sentence] of limits) {
                if (cap <= 0) {
                    continue;
                }
                let count;
                try {
                    count = store.consumeRate(key, window);
                } catch (e) {
                    log('rate counter unavailable (' + scope + ')');
                    if (!config.requireOriginOnWrites) {
                        return;   // self-hosted: let it through rather than fail
                    }
                    throw e;      // relay: a relay with no counter will be filled
                }
                if (count > cap) {
                    const left = Math.max(1, (window + 1) * duration - Math.floor(Date.now() / 1000));
                    const tail = kind === 'write'
                        ? 'Nothing was saved; the text you typed is not lost.'
                        : (kind === 'read'
                            ? 'The page is unaffected: only its notes did not load, and '
                              + 'reloading after the wait shows them.'
                            : 'Nothing was read. This is a limit of this server, not a '
                              + 'failure: the notes are there and unchanged.');
                    const err = new ApFailure(
                        'Too many requests: ' + sentence + '.\n'
                        + 'The limit is ' + cap + ' per ' + duration + ' seconds. Try again in '
                        + left + ' seconds.\n' + tail, 429);
                    err.retryAfter = left;
                    throw err;
                }
            }
        },

        /** Cap on notes per project. 0 means no limit. It refuses the write
         *  beyond and erases nothing. */
        checkNoteCap({ config, store, id }) {
            const cap = config.maxNotesPerProject;
            if (cap <= 0) {
                return;
            }
            if (store.count(id) >= cap) {
                throw new ApFailure(
                    'This project has reached the cap of ' + cap + ' notes set by this '
                    + "server's operator.\n"
                    + 'No note was erased: it is the write that is refused.\n'
                    + 'Nothing was saved; the text you typed is not lost.', 403);
            }
        },
    };
}

export default createBounds;
