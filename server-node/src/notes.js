/*
 * notes.js -- THE SHAPE OF A NOTE, AND THE DATE FORMAT, both shared.
 *
 * This is the port of the MySQL/SQLite store's normalise() and of ap_iso_date().
 * In PHP the shape is "this file's one accepted duplication" between the two
 * stores because it is the contract between the store and all the rest of the
 * server; here there is one store that ships, so the shape lives once and every
 * store returns it. A store that diverged from this would hand the handler a
 * note that does not exist.
 */

/**
 * A UTC datetime as the store holds it ("Y-m-d H:i:s") turned into ISO 8601
 * with an explicit offset -- exactly what PHP's DateTime->format('c') produces
 * for a UTC value: "2026-08-30T14:02:11+00:00". Never a "Z", never
 * milliseconds (FORMAT.md 5.1).
 *
 * The store writes these strings itself, in UTC (see the schema), so the input
 * is known. An unreadable value is returned as it stands rather than lost: a
 * bad date is no reason to drop a note.
 *
 * @param {string|null|undefined} utcDatetime
 * @returns {string}
 */
export function apIsoDate(utcDatetime) {
    const raw = utcDatetime == null ? '' : String(utcDatetime);
    // "Y-m-d H:i:s" is what every date column holds. A value already carrying a
    // "T" or an offset is passed through -- we do not reformat what we did not
    // write.
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(raw);
    if (!m) {
        return raw;
    }
    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+00:00`;
}

/**
 * The current instant as the store writes dates: UTC "Y-m-d H:i:s", the exact
 * shape of PHP's gmdate('Y-m-d H:i:s'). created_at and resolved_at are written
 * with this, never by the database engine, so a server's own clock and the
 * engine's timezone cannot disagree.
 *
 * @param {number} [epochSeconds] seconds since the epoch, for a cutoff
 * @returns {string}
 */
export function utcStamp(epochSeconds = undefined) {
    const d = epochSeconds === undefined ? new Date() : new Date(epochSeconds * 1000);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} `
        + `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/**
 * The single shape of a note, whatever the row looked like in storage.
 *
 * Ported key for key from the PHP store's normalise(). `format` absent or zero
 * means 1; an empty `mode` means plain -- it is the reader, not the column,
 * that interprets them. The payload columns come back as '' when NULL, once and
 * for all, so nothing downstream has to test for null again.
 *
 * `replies` is added by byPage(), not here: a flat read has no tree.
 *
 * @param {Record<string, unknown>} row
 * @returns {object}
 */
export function normalise(row) {
    const str = (v) => (v == null ? '' : String(v));
    const format = Number(row.format);
    return {
        id: Number(row.id),
        project: str(row.project),
        page_index: str(row.page_index),
        format: Number.isFinite(format) && format > 0 ? format : 1,
        mode: str(row.mode) !== '' ? str(row.mode) : 'plain',
        page: str(row.page),
        selector: str(row.selector),
        fingerprint: str(row.fingerprint),
        excerpt: str(row.excerpt),
        author: str(row.author),
        text: str(row.text),
        created_at: apIsoDate(row.created_at),
        version: str(row.version),
        environment: str(row.environment),
        viewport: str(row.viewport),
        payload: row.payload == null ? '' : String(row.payload),
        resolution_payload: row.resolution_payload == null ? '' : String(row.resolution_payload),
        title: str(row.title),
        title_payload: row.title_payload == null ? '' : String(row.title_payload),
        resolved_at: row.resolved_at == null ? null : apIsoDate(row.resolved_at),
        resolved_by: str(row.resolved_by),
        resolved_version: str(row.resolved_version),
        reply_to: row.reply_to == null ? null : Number(row.reply_to),
    };
}
