/*
 * statistics.js -- THREE TOTALS, ONCE A DAY, TO ONE ADDRESS. Ported from the
 * SENDER half of statistics.php.
 *
 * WHAT LEAVES THIS MACHINE, and the list is closed: a random id drawn once on
 * this server, its version, and how many projects / notes / pages it has EVER
 * carried (expired ones included -- a total that shrank with retention would
 * read as a tool people are leaving). No domain, no project id, no page, no
 * note, no key, no name; no Referer and no Origin -- a server makes this
 * request, it has no page to speak for. The receiver sees the calling address
 * and the time, as any server does: the id is random, the connection is not.
 *
 * WHAT IS NOT PORTED: the receiver (the one server the address leads to), its
 * proof dance, the door it writes. An embedded module is a sender; it never
 * receives other sites' statistics. So the role/hint/prove machinery of the
 * PHP is absent, and the memory row here holds only { id, last, quiet }.
 *
 * OFF BY DEFAULT here (config.js says why). When on, the report is fired after
 * a successful write and NEVER awaited -- it must not stand between a visitor
 * and their note -- and it swallows every error: nothing it does can cost a
 * note or surface to a caller.
 *
 * What comes back with the yes is the sum of all servers, which `world()` hands
 * to the panel with the list of notes -- shown from the day AFTER it arrives,
 * so neither the figures a page shows nor the moment they change says when this
 * server reported.
 */

import { randomBytes } from 'node:crypto';

const ADDRESS = 'https://api.annotepage.com/stats.php';
const EVERY = 82800;                 // 23 hours, for "once a day"
const TIMEOUT_MS = 5000;
const MEMORY = 'statistics';
const WORLD = 'statistics-world';
const WORLD_DAYS = 30;
const WORLD_NOTES = 1000;
const WORLD_SITES = 50;
const WORLD_SERVERS = 10;

/** 'YYYY-MM-DD' of a UTC epoch-seconds value, like gmdate('Y-m-d'). */
function utcDay(epochSeconds) {
    return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}
/** Epoch seconds of a 'YYYY-MM-DD' at UTC midnight, like strtotime(d.' UTC'). */
function dayStart(day) {
    const t = Date.parse(day + 'T00:00:00Z');
    return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
}

/** The address the numbers go to, or null with no reason surfaced (the sender
 *  simply does not report). https unless the server allows plain http. */
function statisticsAddress(config) {
    const url = config.statisticsAddress || ADDRESS;
    const lower = url.toLowerCase();
    const secure = lower.startsWith('https://');
    const plain = lower.startsWith('http://') && config.allowPlainHttp;
    if (!secure && !plain) {
        return null;
    }
    try {
        return new URL(url).host ? url : null;
    } catch (e) {
        return null;
    }
}

/** 16 random bytes in base64url: 22 characters. '' if the generator fails. */
function newId() {
    try {
        return randomBytes(16).toString('base64url');
    } catch (e) {
        return '';
    }
}

/** The report memory row: { id, last, quiet }, with its shapes enforced. */
function readMemory(store) {
    if (typeof store.remembered !== 'function' || typeof store.remember !== 'function') {
        return null;
    }
    const empty = { id: '', last: 0, quiet: false };
    const raw = store.remembered(MEMORY);
    if (typeof raw !== 'string' || raw === '') {
        return empty;
    }
    let decoded;
    try { decoded = JSON.parse(raw); } catch (e) { return empty; }
    if (!decoded || typeof decoded !== 'object') {
        return empty;
    }
    return {
        id: typeof decoded.id === 'string' && /^[A-Za-z0-9_-]{22}$/.test(decoded.id) ? decoded.id : '',
        last: Number.isFinite(decoded.last) ? Math.floor(decoded.last) : 0,
        quiet: !!decoded.quiet,
    };
}

function writeMemory(store, memory) {
    return !!store.remember(MEMORY, JSON.stringify({
        id: memory.id, last: Math.floor(memory.last), quiet: memory.quiet ? 1 : 0,
    }));
}

/** The three figures, or null: ever carried, expired included. */
function figuresOf(store) {
    if (typeof store.serverTotals !== 'function') {
        return null;
    }
    const t = store.serverTotals();
    if (!t) {
        return null;
    }
    const read = (name) => (Number.isFinite(t[name]) ? Math.max(0, Math.floor(t[name])) : 0);
    return {
        projects: read('projects'),
        notes: read('notes') + read('expired_notes'),
        pages: read('pages') + read('expired_pages'),
    };
}

/** The kept world row, decoded, read exactly as written or not at all. */
function worldRow(store) {
    const empty = { at: 0, i: 0, p: 0, n: 0, d: '', di: 0, dp: 0, dn: 0 };
    let kept;
    try { kept = JSON.parse(store.remembered(WORLD) || ''); } catch (e) { return empty; }
    if (!kept || typeof kept !== 'object') {
        return empty;
    }
    for (const f of ['at', 'i', 'p', 'n', 'di', 'dp', 'dn']) {
        if (!Number.isInteger(kept[f]) || kept[f] < 0) {
            return empty;
        }
    }
    if (typeof kept.d !== 'string' || (kept.d !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(kept.d))) {
        return empty;
    }
    return { at: kept.at, i: kept.i, p: kept.p, n: kept.n, d: kept.d, di: kept.di, dp: kept.dp, dn: kept.dn };
}

/** Keeps a sum just received -- shown from the NEXT day, not now. Ported from
 *  ap_statistics_keep_world. */
function keepWorld(store, sum, now) {
    const read = (name) => (sum && Number.isInteger(sum[name]) && sum[name] >= 0
        && sum[name] <= 999999999999 ? sum[name] : null);
    const servers = read('instances');
    const sites = read('projects');
    const notes = read('notes');
    if (servers === null || sites === null || notes === null) {
        return false;
    }
    try {
        const row = worldRow(store);
        const today = utcDay(now);
        const tomorrow = utcDay(now + 86400);
        if (row.d !== '' && row.d >= today && row.d <= tomorrow) {
            return true;   // one already waits; do not push it forward
        }
        if (row.d !== '' && row.d < today) {
            // what waited is already the one shown, by the date: write it so
            row.at = dayStart(row.d);
            row.i = row.di; row.p = row.dp; row.n = row.dn;
        }
        let tag = today;
        if (sum && typeof sum.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sum.day) && sum.day > today) {
            tag = tomorrow;
        }
        row.d = tag;
        row.di = servers; row.dp = sites; row.dn = notes;
        return !!store.remember(WORLD, JSON.stringify(row));
    } catch (e) {
        return false;
    }
}

/**
 * @param {object} [options] `{ log }`
 * @returns {{ report: Function, world: Function }}
 */
export function createStatistics(options = {}) {
    const log = typeof options.log === 'function' ? options.log : () => {};

    /** Fires the daily report. Returns a promise, but callers do not await it:
     *  it must never block a response or throw into one. */
    async function report(config, store) {
        try {
            if (!config.reportStatistics) {
                return;
            }
            const url = statisticsAddress(config);
            if (url === null) {
                return;
            }
            const memory = readMemory(store);
            if (memory === null) {
                return;
            }
            const now = Math.floor(Date.now() / 1000);
            if (now - memory.last < EVERY) {
                return;
            }
            // The slot first, before the count and the request: no record means
            // no gate, and then nothing is done.
            memory.last = now;
            if (!writeMemory(store, memory)) {
                return;
            }
            const figures = figuresOf(store);
            if (figures === null || figures.notes === 0) {
                return;   // nothing ever written here: not a site, not counted
            }
            if (memory.id === '') {
                memory.id = newId();
                if (memory.id === '' || !writeMemory(store, memory)) {
                    return;
                }
                const kept = readMemory(store);
                if (kept && kept.id !== '') {
                    memory.id = kept.id;
                }
            }
            const body = new URLSearchParams({
                id: memory.id,
                version: config.version,
                projects: String(figures.projects),
                notes: String(figures.notes),
                pages: String(figures.pages),
            }).toString();

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'user-agent': 'annotepage/' + config.version,
                },
                body,
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });

            if (!res.ok) {
                // A 404 or a 429 is not news: the receiver may not be there, or
                // may be rationing new servers. Anything else is said once (via
                // the log) and not again until a report goes through.
                if (res.status !== 404 && res.status !== 429 && !memory.quiet) {
                    memory.quiet = true;
                    writeMemory(store, memory);
                    log('statistics: not sent (' + res.status + '); tried again tomorrow');
                }
                return;
            }
            if (memory.quiet) {
                memory.quiet = false;
                writeMemory(store, memory);
            }
            const text = await res.text();
            const found = /\{"result"[^{}]{0,300}\}/.exec(text);
            if (found) {
                let sum;
                try { sum = JSON.parse(found[0]); } catch (e) { sum = null; }
                if (sum) {
                    keepWorld(store, sum, Math.floor(Date.now() / 1000));
                }
            }
        } catch (e) {
            log('statistics: ' + (e && e.message ? e.message : e));
        }
    }

    /** What the panel is handed, or null: { notes }, with sites and servers
     *  before it once each is worth a figure. One read, no write; which kept
     *  sum shows is decided by the date each time. */
    function world(config, store, now = null) {
        try {
            if (!config.reportStatistics || typeof store.remembered !== 'function') {
                return null;
            }
            const row = worldRow(store);
            now = now === null ? Math.floor(Date.now() / 1000) : now;
            let shown;
            if (row.d !== '' && row.d < utcDay(now)) {
                shown = { at: dayStart(row.d), i: row.di, p: row.dp, n: row.dn };
            } else {
                shown = { at: row.at, i: row.i, p: row.p, n: row.n };
            }
            if (shown.at <= 0 || shown.at > now || now - shown.at > WORLD_DAYS * 86400) {
                return null;
            }
            if (shown.n < WORLD_NOTES) {
                return null;
            }
            const out = {};
            if (shown.i >= WORLD_SERVERS) {
                out.servers = shown.i;
            }
            if (shown.p >= WORLD_SITES) {
                out.sites = shown.p;
            }
            out.notes = shown.n;
            return out;
        } catch (e) {
            return null;
        }
    }

    return { report, world };
}

export default createStatistics;
