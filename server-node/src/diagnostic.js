/*
 * diagnostic.js -- the state of the server, as text/plain, for ?action=diagnostic.
 *
 * No parameter, no project, never a note. How much comes out is the server's
 * decision (FORMAT.md section 6.1): the default is a few lines -- tool, version,
 * format, verdict -- because the action is unauthenticated; `full` widens it to
 * what the store reports, and `off` makes the action not exist (handled by the
 * router, which answers it exactly as it answers an action nobody ever heard
 * of). A client reads what comes back and shows it; nothing in the protocol
 * depends on a line being there.
 */

import { AP_FORMAT } from './constants.js';

/** Renders [key, value] pairs the way the PHP diagnostic does: "key value",
 *  a bare value for a key-less line, a blank line for an empty pair. */
function render(lines) {
    return lines.map(([key, value]) => {
        if (key === '' && (value === '' || value == null)) {
            return '';
        }
        if (key === '') {
            return String(value);
        }
        return key + ' ' + value;
    }).join('\n') + '\n';
}

/**
 * @param {object} config
 * @param {object} store
 * @param {'minimal'|'full'} level
 * @returns {string}
 */
export function writeDiagnostic(config, store, level) {
    const lines = [
        ['tool', 'annotepage'],
        ['version', config.version],
        ['format', AP_FORMAT],
    ];

    if (level === 'full' && typeof store.diagnosticLines === 'function') {
        lines.push(['', '']);
        lines.push(...store.diagnosticLines());
        return render(lines);
    }

    // minimal: a single verdict, derived from the store's own state.
    let verdict = 'operational.';
    try {
        const st = typeof store.state === 'function' ? store.state() : { connection: true };
        if (!st.connection) {
            verdict = 'the database is UNREADABLE: no note can be saved.';
        } else if (st.table_present === false) {
            verdict = 'reachable, table missing: it is created at the first note.';
        } else if (Array.isArray(st.missing_columns) && st.missing_columns.length) {
            verdict = 'table INCOMPLETE (earlier version): completed at the next call.';
        }
    } catch (e) {
        verdict = 'the database refused the query.';
    }
    lines.push(['', '']);
    lines.push(['verdict', verdict]);
    return render(lines);
}
