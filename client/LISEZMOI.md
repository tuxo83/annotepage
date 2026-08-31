# @annotepage/client

La couche d'annotation d'annotepage, côté navigateur.

On ouvre une page, on clique sur ce qu'on voit — un titre, une image, un
bouton — et on écrit une remarque. Elle est **chiffrée dans le navigateur**
avant de partir, épinglée à cet élément, et tout le monde voit les notes de
tout le monde. Un correcteur — humain ou IA — y répond, la marque corrigée en
disant dans quelle version le correctif part, et la remarque passe en
historique sans jamais être supprimée.

Ce paquet est **un seul fichier**, sans dépendance, chargé par une balise
`<script>`. Il ne parle d'aucun site en particulier et n'en connaît aucun.

Le format d'échange, le modèle de sécurité et ce qu'ils ne promettent pas sont
décrits dans `FORMAT.md`, à la racine du dépôt. Quand ce fichier-ci et
`FORMAT.md` se contredisent, c'est `FORMAT.md` qui a raison.

## Ce qu'il exige

- un navigateur récent, dans un **contexte sûr** : `https`, ou `localhost`.
  Sans lui, le navigateur ne fournit pas WebCrypto, et l'outil ne peut ni
  chiffrer, ni même calculer l'index de page — il le dit à l'écran plutôt que
  de faire semblant ;
- un **serveur annotepage** joignable : le site lui-même (auto-hébergé), ou
  une machine tierce (relais). Un seul code PHP, déployé à l'un ou l'autre
  endroit ;
- rien d'autre. Ni cadriciel, ni empaqueteur, ni feuille de style à charger à
  part.

## Poser l'outil sur un site

### 1. Engendrer le sel, et le ranger

Chargez le client une fois, sur une page du site, avec `data-installation` et
**sans** `data-projet` :

```html
<script src="https://<votre-cdn>/@annotepage/client@2.0.0/dist/annotepage.js"
        integrity="sha384-aCo5oDTz3+fsqenyCuEE4kOKeR/ieBDCu9keGaY90gGQs9KzK6XUZhMcaHgRaNQx"
        crossorigin="anonymous"
        data-serveur="https://<votre-serveur>/annotepage/api.php"
        data-installation
        defer></script>
```

L'écran d'installation engendre un **sel de 256 bits** et vous rend quatre
choses à recopier : le sel, l'identifiant de projet, la balise définitive, et
les trois lignes à déclarer côté serveur. Aucune requête réseau n'est faite à
ce moment-là.

> **SEL PERDU = NOTES PERDUES.** Le sel est le seul secret du projet. Il ne
> quitte jamais le navigateur, le serveur ne le reçoit sous aucune forme, et
> personne ne peut vous le redonner. Il n'y a ni récupération, ni question
> secrète, ni tiers de séquestre. Rangez-le là où votre équipe range ses mots
> de passe **avant** de continuer.

### 2. Coller la balise définitive, en fin de `<body>`

```html
<script src="https://<votre-cdn>/@annotepage/client@2.0.0/dist/annotepage.js"
        integrity="sha384-aCo5oDTz3+fsqenyCuEE4kOKeR/ieBDCu9keGaY90gGQs9KzK6XUZhMcaHgRaNQx"
        crossorigin="anonymous"
        data-serveur="https://<votre-serveur>/annotepage/api.php"
        data-projet="7Qb1kZ3xNvA9dLpEqKf2Zt"
        data-version="1.4.12"
        data-environnement="preprod"
        defer></script>
```

**`integrity` n'est pas décoratif.** Dès que le client part en CDN, le vrai
risque de cette architecture est la chaîne d'approvisionnement : un fichier
remplacé chez l'hébergeur du CDN s'exécute dans votre page, avec accès au
`localStorage` — donc au sel. L'empreinte SRI est ce qui rend ce remplacement
inopérant. `crossorigin="anonymous"` va avec : sans lui, le navigateur ne
vérifie pas l'empreinte d'une ressource d'une autre origine.

L'empreinte **de la version que vous servez** se lit dans `dist/EMPREINTES.txt`
du paquet, et la construction l'imprime. Celle ci-dessus est celle de la 2.0.0.
Ne recopiez jamais une empreinte d'une documentation pour une autre version :
le navigateur refusera le fichier, et c'est exactement son travail.

**N'ajoutez pas `type="module"`.** Un script de module n'a pas de
`document.currentScript` : le client ne saurait plus lire ses propres attributs
et se retirerait en silence.

### 3. Déclarer le projet côté serveur, et donner le sel à l'équipe

Le serveur reçoit l'identifiant de projet (public) et la liste des origines
autorisées. Le sel, lui, se transmet **hors bande** — l'outil ne fournit aucun
canal pour cela. Chaque relecteur le colle une fois : l'outil lui présente
l'écran de collage, vérifie que le sel dérive bien l'identifiant déclaré par la
page, et le retient dans son navigateur.

## Les attributs de la balise

| Attribut | Ce qu'il déclare |
|---|---|
| `data-serveur` | l'adresse de `api.php`. Obligatoire dès que le client vient d'un CDN. Sans lui, et seulement si le client est servi par le site, l'outil déduit `../api.php` de sa propre adresse — comme la version 1.2.0 |
| `data-projet` | l'identifiant de projet, 22 caractères. Sans lui, l'outil ne fait **rien** (sauf avec `data-installation`) |
| `data-installation` | ouvre l'écran d'installation. À retirer une fois le projet créé |
| `data-mode` | `chiffre` (défaut) ou `clair`. Voir plus bas |
| `data-chemin` | préfixe de chemin : les pages du projet. `/fr/` n'annote pas `/en/` |
| `data-domaines` | origines du projet, séparées par des virgules |
| `data-version` | la version RÉELLEMENT servie, telle que le site la nomme |
| `data-environnement` | le nom de l'environnement, écrit tel quel dans la note |
| `data-libelles` | un fichier de libellés propre au site, résolu par rapport au document |

`data-version` sert à une seule chose, mais elle compte : quand une note est
marquée corrigée, l'outil compare la version du correctif à celle-ci pour
distinguer « corrigée et en ligne » — qui passe en historique replié — de
« corrigée, pas encore déployée » — qui reste sous les yeux du relecteur, parce
que le défaut, lui, est encore à l'écran. Version absente ou illisible : le
correctif est tenu pour NON déployé, la note reste visible.

Un outil autonome ne devine pas comment un site nomme sa version : sans ces
attributs, les champs restent vides, et c'est voulu.

## Chiffré, ou clair

Le chiffrement est **actif par défaut**. En mode chiffré, tout ce qui est saisi
ou observé part dans une enveloppe AES-256-GCM que le serveur ne peut pas
ouvrir : le texte, mais aussi la page, le sélecteur, l'extrait, le nom du
relecteur, la version, l'environnement. Chiffrer le seul texte livrerait
l'arborescence du site, ses intitulés et la liste de ses relecteurs — et une
préproduction est précisément ce qu'on ne publie pas encore.

`data-mode="clair"` n'est acceptable **qu'en auto-hébergé**, où le chiffrement
ne protège de rien : les notes sont dans la même base, sur la même machine,
derrière la même restriction d'accès que le site relu. **Un relais le refuse**,
en 400, et affiche son message.

Le mode est inscrit dans chaque note. Une installation qui a tourné en clair
deux semaines avant d'activer le chiffrement reste entièrement lisible : chaque
ligne dit ce qu'elle est.

## Ce que le serveur ne voit jamais, et ce qu'il voit quand même

Il ne reçoit ni le sel, ni la clé, ni le chemin de vos pages : il regroupe par
**index aveugle**, un HMAC du chemin qu'il ne sait pas inverser. Il voit en
revanche le nombre de projets et de notes, le nombre de pages distinctes,
l'heure de chaque écriture, la forme des fils, la longueur approximative de
chaque remarque, l'adresse IP de chaque relecteur — et, en mode relais, **le
domaine du site relu**, par l'en-tête `Origin` que le verrou de domaine exige
justement de lire. La promesse n'est pas « le relais ignore quel site vous
relisez » ; elle est « le relais ne peut lire ni vos chemins, ni vos noms, ni
vos remarques ».

Le verrou de domaine du serveur est une mesure **anti-abus** : il empêche un
autre site de consommer un identifiant de projet trouvé dans le code source
d'une page. **Ce n'est pas une protection contre les XSS** : une XSS s'exécute
DANS la page visée, donc avec l'origine légitime, et elle a accès au
`localStorage`, donc au sel.

Le préfixe de chemin (`data-chemin`) est vérifié **par le client** — le serveur
ne voit pas les chemins. C'est du **rangement**, pas une frontière de sécurité.

## Politique de sécurité de contenu (CSP)

Si le site en sert une, trois directives la concernent :

- `script-src` : l'origine du CDN, sans quoi le client ne se charge pas ;
- `connect-src` : l'origine du serveur annotepage, sans quoi `fetch` échoue et
  l'outil se retire en silence, comme si rien n'était configuré ;
- `style-src` : rien à faire dans la plupart des cas. La feuille est posée en
  **feuille construite**, qui n'est pas une feuille en ligne au sens de la
  politique. Sur un navigateur qui ne sait pas en construire, l'outil retombe
  sur un `<style>`, que `style-src` sans `'unsafe-inline'` bloquera — l'outil
  fonctionnera, mais sans style.

## Deux silences et un cri

**Il se retire en silence quand il n'a rien à faire.** Si l'API ne répond pas,
ne répond pas du JSON, dit qu'elle n'est pas configurée, ou si la page est hors
de la portée du projet, le client n'ajoute rien au DOM et n'écrit rien dans la
console. On peut donc laisser la balise dans un gabarit commun à tout le site.

**Mais une fois en place, il ne se tait plus.** Toute panne s'affiche, avec le
message que le serveur a rédigé, et **le texte saisi reste dans le
formulaire**. Une remarque qu'on croit enregistrée et qui ne l'est pas est pire
que pas d'outil du tout.

**Un refus est nommé.** Défaut constaté en production : un pare-feu
d'hébergeur répond 403 avec une page HTML, et l'utilisateur lisait « le serveur
a répondu quelque chose d'inattendu ». C'était vrai et inutile. L'outil nomme
maintenant le refus, donne son code, et suggère le seul geste qui le contourne
souvent : reformuler la remarque, sans balises ni fragments de code. Le texte,
lui, est conservé — cela n'a pas changé.

Un refus au tout premier appel s'affiche aussi, contrairement à la 1.2.0 : un
pare-feu qui bloque tout rendait l'outil entièrement invisible, et on cherchait
la panne dans le mauvais fichier.

## Ce qu'il ne touche pas

Le client n'ajoute au site qu'**un seul élément**, en fin de `<body>`, et
travaille dans un `shadow root` : il ne pose ni classe, ni attribut, ni style
sur un élément de la page, et la surbrillance de désignation est un rectangle
dessiné chez lui, jamais un contour posé sur l'élément visé. Ses styles sont
préfixés `ap-` et vivent à l'intérieur du shadow root : ils ne peuvent pas
atteindre le site, et le site ne peut pas les atteindre.

Sa palette est la sienne et suit `prefers-color-scheme` : il ne lit ni les
variables, ni le thème du site hôte.

`textContent` partout, `innerHTML` nulle part : le texte d'une note est saisi
par un humain et n'est jamais interprété comme du balisage.

## Traduire, ou changer un mot

Tous les textes affichés sont dans `source/15-libelles.js`, dans un objet plat,
en français. Deux façons de les remplacer sans toucher au code, par priorité :

```html
<!-- 1. un objet, defini AVANT le client -->
<script>window.Annotepage = { libelles: { 'bouton.ouvrir': 'Annotate' } };</script>
<script src="https://.../annotepage.js" ... defer></script>

<!-- 2. un fichier voisin, DECLARE sur la balise -->
<script src="https://.../annotepage.js" data-libelles="/libelles-locaux.js" ... defer></script>
```

Un libellé absent retombe sur le français : une traduction partielle reste
utilisable.

## Construire, vérifier, publier

```
npm run build     assemble dist/annotepage.js et imprime son empreinte sha384
npm test          verifie les derivations, l'index aveugle et l'enveloppe
npm publish --access public
```

`--access public` n'est pas un détail : un paquet **scopé** est privé par
défaut, et la première publication échouerait sans lui. `publishConfig` le pose
déjà dans `package.json`, le drapeau est là pour les cas où l'on publie à la
main.

La construction n'a **aucune dépendance** : ni empaqueteur, ni minificateur.
C'est délibéré — le fichier part dans la page de quelqu'un d'autre, et la
chaîne d'approvisionnement est le risque principal de cette architecture. Le
fichier reste lisible, et une empreinte se vérifie sur ce qu'on peut lire.

`npm test` recoupe les vecteurs du format avec une seconde implantation de
HKDF-SHA-256 écrite à la main d'après la RFC 5869. C'est ce qui garantit que le
sel est bien le matériau d'entrée et `annotepage/1` le sel de HKDF, et non
l'inverse : les deux « marchent », un seul est le format. Le serveur PHP et le
paquet MCP peuvent recopier ces vecteurs pour vérifier qu'ils parlent du même
format.

## Ce qu'il y a dans le paquet

```
dist/annotepage.js       LE fichier servi. Engendre : ne pas le modifier a la main
dist/EMPREINTES.txt      une empreinte sha384 par version publiee
source/00-preambule.js   lecture de la balise : serveur, projet, portee, bornes
source/10-outils.js      libelles, base64url, dates, versions
source/15-libelles.js    TOUS les textes affiches, francais par defaut
source/20-chiffrement.js sel, HKDF, index aveugle, enveloppe AES-256-GCM
source/30-etat.js        etat, memoire du navigateur, portee
source/40-api.js         les appels, les refus, ce qui part chiffre ou clair
source/50-reperes.js     retrouver l'element d'une note, ou la dire orpheline
source/60-interface.js   tout le DOM, dans le shadow root
source/70-installation.js les deux ecrans qui montrent ou demandent le sel
source/90-demarrage.js   l'ordre d'allumage, et les silences
source/styles.css        styles confines, inlines a la construction
outils/construire.mjs    l'assemblage, et l'empreinte SRI
outils/verifier.mjs      les vecteurs du format
```

Les sources ne sont pas des modules : ce sont les **sections** d'un seul
fichier, mises bout à bout par la construction dans une seule portée. C'est ce
qui permet de porter le client de la 1.2.0 sans le réécrire.

## Ce qu'il ne fait pas

C'est un choix, pas un oubli :

- **pas d'authentification.** Le nom saisi est un confort, pas une identité.
  L'identifiant de projet est un jeton porteur : qui l'a peut lire et écrire.
  En mode chiffré, ce qu'il lit est inexploitable sans le sel ;
- **pas de modération, et aucune suppression.** Une note posée reste. Le seul
  état qu'elle puisse changer est « corrigée », et cet état se reprend ;
- **pas de rotation du sel.** Il n'existe aucun mécanisme : un sel qui fuit
  oblige à repartir d'un projet neuf, en abandonnant les notes ;
- **pas de canal pour transmettre le sel** au deuxième relecteur ;
- **pas de masquage de la longueur** des remarques : la taille de l'enveloppe
  la donne à quelques octets près.

Le sel est retenu **par navigateur et par origine**. Le jour où la
préproduction devient la production, chaque relecteur le recolle une fois sur
le nouveau domaine — les notes, elles, ne bougent pas. C'est précisément ce
qu'achète la règle « le domaine n'entre pas dans la clé ».

## Licence

MIT.
