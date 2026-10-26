/*
 * config.js -- the configuration the host hands in, normalised once.
 *
 * The PHP server reads a config-local.php written by an installer; an embedded
 * Node server is handed a plain object by the app that mounts it. The keys that
 * matter are the same handful FORMAT.md turns on -- plain mode, whether a write
 * must carry an Origin, open registration, retention -- and nothing here is an
 * installer: there is no file to write and no credentials to read, because the
 * store is passed in already made.
 *
 * DEPLOYMENT DEFAULTS TO SELF-HOSTED, which is what embedding in an app's own
 * server is: the notes sit behind the same door as the pages they annotate. So
 * plain mode is allowed and a write need not carry an Origin (a same-origin
 * request sends none). A relay -- a server holding other sites' notes -- is
 * `selfHosted: false`, and then plain mode is impossible and every write must
 * carry an Origin, exactly as the PHP relay enforces.
 */

import { validateDeclaredOrigins } from './origins.js';

/** A version string, or 'unknown'. The three announce-never-gate versions of
 *  FORMAT.md section 6.1: the server's own, the client it believes current, the
 *  mcp it believes current. Absent/invalid reads as 'unknown'. */
function versionOr(value) {
    if (typeof value === 'string'
        && /^(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})$/.test(value.trim())) {
        return value.trim();
    }
    return 'unknown';
}

/** A non-negative integer from the configuration, 0 for anything else. */
function nonNegInt(value) {
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** The server's own version accepts a looser shape (a VERSION file can carry a
 *  build suffix), matching ap_version(). */
function serverVersionOr(value) {
    if (typeof value === 'string' && /^[0-9A-Za-z.+-]{1,32}$/.test(value.trim()) && value.trim() !== '') {
        return value.trim();
    }
    return 'unknown';
}

/** Normalises the declared projects into a map id -> { origins, mode }.
 *  `origins` is an array of exact origins (a leading `*.` asks for subdomains),
 *  or null for "any". `mode` is the project's declared mode, encrypted by
 *  default -- the safe one, and the only one a relay allows. */
function normaliseProjects(projects) {
    const out = new Map();
    if (!projects) {
        return out;
    }
    const entries = Array.isArray(projects)
        ? projects.map((p) => [p.id, p])
        : Object.entries(projects);
    for (const [id, p] of entries) {
        const project = p || {};
        // origins: null (or absent) means no domain lock -- fine when
        // self-hosted and same-origin. A list turns the anti-abuse lock on,
        // and each entry is validated and canonicalised here so a typo is a
        // configuration error now, not a silent 403 later.
        let origins = project.origins;
        if (origins === undefined || origins === null) {
            origins = null;
        } else {
            origins = validateDeclaredOrigins(
                Array.isArray(origins) ? origins : [origins], String(id));
        }
        const mode = project.mode === 'plain' ? 'plain' : 'encrypted';
        out.set(String(id), { origins, mode });
    }
    return out;
}

/**
 * @param {object} raw the host's configuration object
 * @returns {object} the normalised configuration the handler reads
 */
export function normaliseConfig(raw = {}) {
    const selfHosted = raw.selfHosted !== false;   // default true
    const diagnostic = ['off', 'minimal', 'full'].includes(raw.diagnostic)
        ? raw.diagnostic : 'minimal';
    return {
        active: raw.active !== false,              // mounting it is activating it
        selfHosted,
        allowPlainMode: raw.allowPlainMode !== undefined ? !!raw.allowPlainMode : selfHosted,
        requireOriginOnWrites: raw.requireOriginOnWrites !== undefined
            ? !!raw.requireOriginOnWrites : !selfHosted,
        openRegistration: !!raw.openRegistration,
        publishServerTotals: !!raw.publishServerTotals,
        // ON by default, exactly as the PHP server (statistics.php: "The
        // default is yes"). Keeping the two in step is the point: a server that
        // reported on PHP goes on reporting in Node, with no behaviour to
        // relearn and no feature delta between the two. Set `false` to turn it
        // off. What is sent is a random id, the version and three totals, and
        // nothing else (FORMAT.md section 6.5).
        reportStatistics: raw.reportStatistics !== false,
        statisticsAddress: typeof raw.statisticsAddress === 'string' && raw.statisticsAddress !== ''
            ? raw.statisticsAddress : null,
        allowPlainHttp: !!raw.allowPlainHttp,
        maxNoteAgeDays: Number.isFinite(raw.maxNoteAgeDays) && raw.maxNoteAgeDays > 0
            ? Math.floor(raw.maxNoteAgeDays) : 0,
        diagnostic,
        projects: normaliseProjects(raw.projects),
        version: serverVersionOr(raw.version),
        clientVersion: versionOr(raw.clientVersion),
        mcpVersion: versionOr(raw.mcpVersion),
        // Bounds knobs, read by the bounds module (see bounds.js). All off by
        // default -- a server that asked for none pays for none, exactly as the
        // PHP: a 0 window or a 0 cap touches no counter.
        maxBodyBytes: nonNegInt(raw.maxBodyBytes),
        rateWindowSeconds: nonNegInt(raw.rateWindowSeconds),
        rateWritesPerIp: nonNegInt(raw.rateWritesPerIp),
        rateWritesPerProject: nonNegInt(raw.rateWritesPerProject),
        rateReadsPerIp: nonNegInt(raw.rateReadsPerIp),
        rateExportsPerIp: nonNegInt(raw.rateExportsPerIp),
        maxNotesPerProject: nonNegInt(raw.maxNotesPerProject),
        // A header to read the client address from, behind a proxy. NEVER
        // trusted by default: a header the client writes makes a limit
        // bypassable in one line (see bounds.js).
        clientIpHeader: typeof raw.clientIpHeader === 'string' && raw.clientIpHeader !== ''
            ? raw.clientIpHeader : null,
    };
}

/** The project record for an id, applying open registration: an undeclared id
 *  on a relay with open registration becomes an encrypted project with no
 *  origin list. Returns null for an unknown id on a server that is not open. */
export function projectFor(config, id) {
    if (config.projects.has(id)) {
        return config.projects.get(id);
    }
    if (config.openRegistration) {
        // Encrypted, always, and origins null ("any"): a public relay that
        // stored plaintext would hand its operator every path, name and remark.
        return { origins: null, mode: 'encrypted' };
    }
    return null;
}
