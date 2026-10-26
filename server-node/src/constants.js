/*
 * The numbers that are not configuration. Ported from config.php, where they
 * are declared once and a configuration file that still sets one is logged and
 * ignored -- see FORMAT.md section 3.6 for why a width in the database is a
 * second opinion that settles disagreements badly.
 *
 * They are the per-field limits of plain mode, in CHARACTERS, and the envelope
 * limits of encrypted mode, in characters (ASCII, so bytes too).
 */

/** THE FORMAT NUMBER, an integer with no dot. It appears in three places that
 *  must agree: the `format` column of every row, the `ap<n>` prefix of every
 *  envelope, the `format` line of the export header. Declared once. */
export const AP_FORMAT = 2;

export const AP_LEN_TEXT = 4000;
export const AP_LEN_AUTHOR = 80;
export const AP_LEN_PAGE = 300;
export const AP_LEN_SELECTOR = 500;
export const AP_LEN_FINGERPRINT = 255;
export const AP_LEN_EXCERPT = 300;
export const AP_LEN_TITLE = 70;
export const AP_LEN_VERSION = 60;
export const AP_LEN_ENVIRONMENT = 20;
export const AP_LEN_VIEWPORT = 20;
export const AP_LEN_PAYLOAD = 24000;
export const AP_LEN_RESOLUTION_PAYLOAD = 2000;
export const AP_LEN_TITLE_PAYLOAD = 1000;
