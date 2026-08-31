# Ce que fait l'integration continue, et ce qu'elle exige

Deux fichiers, pas trois. Chacun a une raison d'exister.

## `workflows/controle.yml` — a chaque poussee

Pour chaque paquet present : installation, construction, tests, puis
`npm pack --dry-run`, qui repond a la seule question que le registre posera
(quels fichiers partent, le manifeste tient-il debout). Un paquet absent
avertit sans faire echouer : `client/` et `mcp/` n'arrivent pas le meme jour.

Un second travail joue le test de bout en bout s'il en trouve un. Il le cherche
dans cet ordre : `outils/bout-en-bout.mjs`, `tests/bout-en-bout.mjs`, puis le
meme nom sous `mcp/outils/`, `client/outils/`, `serveur/outils/`. A defaut, un
script racine `npm run bout-en-bout`. Rien de tout cela n'existait quand ce
fichier a ete ecrit : le premier de ces chemins cree sera joue sans rien
modifier ici.

## `workflows/publication.yml` — sur etiquette

Convention, et elle est le seul declencheur :

    client-v<version>   ->  annotepage-client   (repertoire client/)
    mcp-v<version>      ->  annotepage-mcp      (repertoire mcp/)

    git tag client-v2.0.0 && git push origin client-v2.0.0

Publication de confiance par OIDC : **aucun jeton n'est stocke**, ni dans les
secrets du depot, ni ailleurs. Le travail echange un jeton OIDC de quelques
minutes contre un droit de publication.

Si la version de l'etiquette est deja en ligne, le travail le dit et sort vert
sans rien publier : republier ferait echouer, et un echec de routine finit par
ne plus etre lu.

### Ce qu'il faut avoir fait avant la premiere etiquette

1. **Sur npmjs.com, pour chacun des deux paquets** : Settings > Trusted
   Publisher > GitHub Actions, organisation `tuxo83`, depot `annotepage`,
   fichier de travail `publication.yml` — le nom exact, extension comprise.
   Renommer ce fichier casse la publication ; le refus se lit
   « unable to authenticate » et ne nomme pas la cause.
2. **Dans chaque `package.json`** : le nom NON SCOPE (`annotepage-client`,
   `annotepage-mcp`) et un champ `repository` designant ce depot — npm refuse
   une publication de confiance si l'un des deux manque. Le travail verifie les
   deux avant de tenter quoi que ce soit, pour que le refus soit lisible.
3. **Un paquet jamais publie** n'a pas de page de reglages ou declarer son
   editeur de confiance : la toute premiere mise en ligne de chaque nom se fait
   a la main, l'automatisme prend la suite. A confirmer au moment venu.

La provenance n'est pas demandee par un drapeau : pour un depot public publie
par OIDC, npm l'engendre seul. `--provenance` ne ferait que le repeter.

## Pas de `pages.yml`

Le site est du HTML et du CSS ecrits a la main, sans dependance ni etape de
construction. GitHub Pages sert `docs/` de la branche par defaut directement,
sans integration continue : un travail de publication du site n'aurait rien a
faire d'autre que recopier des fichiers deja prets. Une piece de moins a
casser.

Cela suppose que le site final soit **dans `docs/`**. S'il devait rester sous
`site/`, il faudrait soit le deplacer, soit ajouter le travail que l'on evite
ici — Pages ne sait servir que la racine ou `docs/`.
