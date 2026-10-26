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
        let origins = project.origins;
        if (origins === undefined) {
            origins = null;
        } else if (origins !== null && !Array.isArray(origins)) {
            origins = [String(origins)];
        } else if (Array.isArray(origins)) {
            origins = origins.map(String);
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
        reportStatistics: raw.reportStatistics !== false,   // default true
        maxNoteAgeDays: Number.isFinite(raw.maxNoteAgeDays) && raw.maxNoteAgeDays > 0
            ? Math.floor(raw.maxNoteAgeDays) : 0,
        diagnostic,
        projects: normaliseProjects(raw.projects),
        version: serverVersionOr(raw.version),
        clientVersion: versionOr(raw.clientVersion),
        mcpVersion: versionOr(raw.mcpVersion),
        // Bounds knobs (enforced by the bounds module). Carried through so the
        // host sets them in one place; the handler reads them via bounds.
        rate: raw.rate || {},
        maxBodyBytes: Number.isFinite(raw.maxBodyBytes) ? raw.maxBodyBytes : 0,
        maxProjects: Number.isFinite(raw.maxProjects) ? raw.maxProjects : 0,
        maxNotesPerProject: Number.isFinite(raw.maxNotesPerProject) ? raw.maxNotesPerProject : 0,
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
