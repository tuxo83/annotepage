/* A LABEL FILE THE TAG CAN LOAD, MADE FROM THE ONE THIS PACKAGE ALREADY SHIPS.
 *
 * `data-labels` loads a SCRIPT -- the client inserts a <script> and reads
 * window.Annotepage.labels once it has run -- and the package shipped its
 * French set as JSON only. So every site that wanted French copied fr.json
 * into a .js file of its own, in its own repository, frozen at whatever
 * version it was copied from and never updated again: measured on the first
 * site migrated to annotepage, which did exactly that.
 *
 * labels/fr.js is that wrapper, generated here from labels/fr.json by
 * tools/build.mjs and compared with it by tools/check.mjs, so the two cannot
 * drift. A site loads it from the same CDN and the same range as the client:
 *
 *     data-labels="https://cdn.jsdelivr.net/npm/annotepage-client@2/labels/fr.js"
 *
 * THE SITE'S OWN LABELS STILL WIN. Whatever a page put in
 * window.Annotepage.labels before the tag -- one label changed, say -- is
 * kept over the French set, which only fills what the page did not say.
 */
export function labelsScript(json, name) {
    const labels = typeof json === 'string' ? JSON.parse(json) : json;
    return '/* annotepage-client ' + name + ' labels -- generated from labels/'
        + name + '.json by tools/build.mjs. Do not edit: edit the JSON.\n'
        + '   Load it with data-labels on the tag; labels a page set itself before the\n'
        + '   tag are kept. MIT licence, like the rest of the package. */\n'
        + '(function () {\n'
        + '    var set = ' + JSON.stringify(labels, null, 4).replace(/\n/g, '\n    ') + ';\n'
        + '    var page = (window.Annotepage && window.Annotepage.labels) || {};\n'
        + '    window.Annotepage = window.Annotepage || {};\n'
        + '    window.Annotepage.labels = Object.assign({}, set, page);\n'
        + '}());\n';
}
