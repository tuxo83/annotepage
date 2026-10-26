/*
 * origins.js -- THE DOMAIN LOCK's shapes and comparison, ported from the top
 * of origins.php.
 *
 * WHAT THIS LOCK IS: an ANTI-ABUSE measure. It stops another site from picking
 * up a project id in the source of a page, writing noise into it and burning a
 * relay's quota.
 *
 * WHAT IT IS NOT, and must never be presented as: a protection against XSS. An
 * XSS runs INSIDE the target page, with the legitimate origin, and has the
 * key from localStorage anyway. This file changes nothing about that.
 *
 * These are pure functions: a string in, a verdict out. The policy that uses
 * them -- what to refuse, what header to echo -- is bounds.js.
 */

import { ApFailure } from './errors.js';
import { readableExcerpt, shortProject } from './input.js';

/**
 * Canonical origin: scheme://host[:port], scheme and host lowercased, the
 * scheme's default port removed -- the exact form a browser puts in Origin.
 * A path, query, fragment or userinfo means this is a URL, not an origin, and
 * is refused rather than trimmed (so two paths of one host cannot declare the
 * same thing). A `*` is left in: a declaration may be a pattern, checked after.
 *
 * @returns {string|null} null when this is not an origin
 */
export function normaliseOrigin(origin) {
    if (typeof origin !== 'string') {
        return null;
    }
    origin = origin.trim();
    if (origin === '' || origin.length > 255) {
        return null;
    }
    // scheme://host[:port], and nothing after: no /path, ?query, #fragment or
    // user@ . The host class allows `*` and `.` for a pattern, and letters,
    // digits, hyphen for a name.
    const m = /^(https?):\/\/([A-Za-z0-9.*_-]+)(?::([0-9]+))?$/.exec(origin);
    if (!m) {
        return null;
    }
    const scheme = m[1].toLowerCase();
    const host = m[2].toLowerCase();
    if (host === '') {
        return null;
    }
    const port = m[3] ? Number(m[3]) : 0;
    const dflt = scheme === 'https' ? 443 : 80;
    if (port === 0 || port === dflt) {
        return scheme + '://' + host;
    }
    return scheme + '://' + host + ':' + port;
}

/**
 * What is wrong with a declared origin carrying a `*`, or null if it is a
 * well-formed pattern `scheme://*.base` with the star alone as the first
 * label and at least two labels after it. Nothing knows the public suffix
 * list: `*.co.uk` passes, and the cost is said in FORMAT.md section 6.2.
 */
export function originPatternProblem(origin) {
    const m = /^(https?):\/\/\*\.([^/*]+)$/.exec(origin);
    if (!m) {
        return 'The star must stand alone in front of the host, and nowhere else.';
    }
    const host = m[2].replace(/:\d+$/, '');
    if (!host.includes('.')) {
        return 'A star in front of a single label covers every site on a top-level domain.';
    }
    if (!/^[a-z0-9_-]+(\.[a-z0-9_-]+)+$/.test(host)) {
        return 'What follows the star is not a domain.';
    }
    return null;
}

/**
 * The request's origin, normalised, or null when the header is absent (a
 * same-origin request sends none). A raw 'null', an empty value, an invalid
 * one, or a pattern (no browser writes a `*`) all read as the string 'null' --
 * an unknown origin, present but matching nothing.
 *
 * @param {string|null} raw the Origin header value, or null when absent
 */
export function requestOrigin(raw) {
    if (raw == null || typeof raw !== 'string') {
        return null;
    }
    raw = raw.trim();
    if (raw === '' || raw === 'null') {
        return 'null';
    }
    const normalised = normaliseOrigin(raw);
    if (normalised === null || normalised.includes('*')) {
        return 'null';
    }
    return normalised;
}

/**
 * Is the request's origin one of the declared ones? Exact equality first, then
 * a pattern `scheme://*.base` matching the same scheme whose host ends in
 * `.base` -- the star stands for at least one label, so `base` itself is not
 * matched and `evil-example.com` does not end in `.example.com`.
 *
 * @param {string} origin from requestOrigin() -- never a pattern
 * @param {string[]} declared normalised declared origins
 */
export function originAllowed(origin, declared) {
    if (declared.includes(origin)) {
        return true;
    }
    const cut = origin.indexOf('://');
    if (cut === -1) {
        return false;
    }
    const scheme = origin.slice(0, cut);
    const rest = origin.slice(cut + 3);
    for (const pattern of declared) {
        const star = pattern.indexOf('://*.');
        if (star === -1 || pattern.slice(0, star) !== scheme) {
            continue;
        }
        const suffix = '.' + pattern.slice(star + 5);
        if (rest.length > suffix.length && rest.endsWith(suffix)) {
            return true;
        }
    }
    return false;
}

/**
 * Validates and canonicalises a project's declared origins. A malformed one is
 * a configuration FAILURE (ApFailure 500), not a dropped entry: a project one
 * believes declared and which is not returns "no notes" to a team that wrote
 * thirty. Ported from the origins loop of ap_declared_projects().
 *
 * @param {unknown[]} declared
 * @param {string} id the project id, for the message
 * @returns {string[]} the normalised, de-duplicated origins
 */
export function validateDeclaredOrigins(declared, id) {
    if (!Array.isArray(declared) || declared.length === 0) {
        throw new ApFailure(
            'Invalid configuration: project ' + shortProject(id) + ' declares no origin.\n'
            + "Give `origins: ['https://staging.example.com']`, or omit the field "
            + 'entirely for no domain lock (self-hosted, same-origin).', 500);
    }
    const seen = new Set();
    for (const origin of declared) {
        const normalised = normaliseOrigin(origin);
        if (normalised !== null && normalised.includes('*')) {
            const why = originPatternProblem(normalised);
            if (why !== null) {
                throw new ApFailure(
                    'Invalid configuration: `' + readableExcerpt(String(origin))
                    + '` is not an origin pattern.\n' + why + '\n'
                    + 'A pattern is written scheme://*.domain, the star alone in front: '
                    + 'https://*.example.com covers every subdomain of example.com.', 500);
            }
            seen.add(normalised);
            continue;
        }
        if (normalised === null) {
            throw new ApFailure(
                'Invalid configuration: `' + readableExcerpt(String(origin))
                + '` is not an origin.\n'
                + 'An origin is written scheme://host[:port], with no path and no '
                + 'trailing slash: https://staging.example.com -- or, for every '
                + 'subdomain, https://*.example.com', 500);
        }
        seen.add(normalised);
    }
    return [...seen];
}
