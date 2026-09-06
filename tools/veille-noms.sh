#!/bin/bash
# ---------------------------------------------------------------------------
# LA VEILLE : le depot publie reste-t-il sans nom d'assistant ?
#
# Les crochets refusent un commit sur CETTE machine. Ils ne peuvent rien contre
# un commit fait ailleurs -- une autre machine, l'editeur web de GitHub, une
# fusion faite dans l'interface -- et c'est exactement par la qu'une signature
# reviendrait sans que personne regarde.
#
# Alors on regarde. Une fois par jour, sur ce qui est REELLEMENT en ligne, pas
# sur la copie locale : on reclone, on relit les messages, on ecrit une ligne.
# Silencieux quand tout va bien, bavard sinon.
#
# CE FICHIER NE PORTE AUCUN NOM, ET C'EST VOULU. Il a ete refuse par le crochet
# a sa premiere version, qui recopiait la liste pour fabriquer son rapport --
# deux listes qui derivent, c'est le defaut que la moitie de ce depot passe son
# temps a rattraper. La detection ET le rapport viennent tous les deux de
# tools/check-ai-names.mjs, qui est la seule liste.
# ---------------------------------------------------------------------------
#
# AUCUN CHEMIN ABSOLU ICI NON PLUS. Le garde-fou des noms l'a refuse a son
# deuxieme essai parce qu'il portait le chemin de la machine qui l'a ecrit --
# un chemin local dans un depot public dit ou quelqu'un travaille. Tout se
# deduit de l'endroit ou ce fichier se trouve, et l'adresse du depot se lit sur
# le remote plutot que d'etre recopiee.
set -u
DEPOT="$(cd "$(dirname "$0")/.." && pwd)"
JOURNAL="${ANNOTEPAGE_VEILLE:-$DEPOT/../.sauvegardes/veille-noms.log}"
ORIGINE="$(git -C "$DEPOT" remote get-url origin 2>/dev/null)"
TEMP=$(mktemp -d)
trap 'rm -rf "$TEMP"' EXIT

quand=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
mkdir -p "$(dirname "$JOURNAL")"

if [ -z "$ORIGINE" ] || ! git clone -q --bare "$ORIGINE" "$TEMP/d.git" 2>/dev/null; then
    echo "$quand  INJOIGNABLE : le clone a echoue" >> "$JOURNAL"
    exit 1
fi

ennuis=0
for b in main next; do
    git -C "$TEMP/d.git" rev-parse --verify -q "$b" >/dev/null || continue
    git -C "$TEMP/d.git" log --format='%an%n%ae%n%B' "$b" > "$TEMP/messages"
    if ! node "$DEPOT/tools/check-ai-names.mjs" message "$TEMP/messages" > "$TEMP/rapport" 2>&1; then
        echo "$quand  ALERTE sur $b :" >> "$JOURNAL"
        sed 's/^/    /' "$TEMP/rapport" >> "$JOURNAL"
        ennuis=1
    fi
done

[ "$ennuis" = 0 ] && echo "$quand  propre : main et next" >> "$JOURNAL"
exit "$ennuis"
