#!/bin/bash
# ---------------------------------------------------------------------------
# THE LEAK GUARD, WHICH IS NOT IN THIS REPOSITORY AND MUST NOT BE.
#
# Its patterns are names: a person, a company, a supplier, a machine. Writing
# them here to check for them would put every one of them in the public history
# -- the exact thing it exists to prevent. So it lives outside, and this file
# holds only how to find it:
#
#     git config annotepage.garde /the/path/to/verifier-fuites.sh
#
# NOT A DEFAULT PATH, EITHER. A path is a name too: it carries a user, a
# directory, sometimes a client. This guard refused an earlier version of these
# hooks for exactly that, and it was right.
#
# NO GUARD MEANS NO COMMIT. A clone that has not been told where it is stops
# here rather than committing unchecked -- the one thing worse than a guard
# that refuses is one that shrugs.
# ---------------------------------------------------------------------------
set -u
GARDE="$(git config --get annotepage.garde || true)"
[ -n "${GARDE}" ] || GARDE="${ANNOTEPAGE_GARDE:-}"

if [ -z "${GARDE}" ]; then
    echo "Le garde-fou n'est pas declare."
    echo "  git config annotepage.garde <chemin du script de verification>"
    echo "Il vit hors du depot, expres : ses motifs sont des noms."
    exit 1
fi
if [ ! -x "${GARDE}" ]; then
    echo "Le garde-fou declare n'est pas executable."
    exit 1
fi
exec "${GARDE}"
