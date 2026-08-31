# annotepage — format d'echange et modele de securite

Version de format : **2**

Ce document est la reference. Le client, le serveur PHP et le paquet MCP
implantent ce qui est ecrit ici, et rien d'autre. Quand une phrase de ce
document et une ligne de code se contredisent, c'est le code qui a tort.

Le format 1 est celui de l'outil d'origine (« notes en contexte », 1.2.0) :
aucun projet, aucun sel, aucun chiffrement, la page en clair. Il n'est pas
abandonne — il est le cas particulier « mode clair » decrit plus bas, et une
base ecrite par le format 1 se lit telle quelle.

---

## 1. Le sel, et ce qui en descend

### 1.1 Le sel

Un **sel de 256 bits** est engendre a l'installation, par
`crypto.getRandomValues()` sur 32 octets. Il n'y a pas d'autre source
acceptable : ni horodatage, ni nom de projet, ni mot de passe choisi par un
humain. Un sel devinable rend tout le reste decoratif.

Il ne quitte jamais le navigateur. Le serveur ne le recoit a aucun moment,
sous aucune forme, dans aucun mode.

**Sel perdu = notes perdues.** Il n'y a pas de recuperation, pas de question
secrete, pas de tiers de sequestre : c'est le seul secret, et personne d'autre
ne l'a. L'ecran d'installation doit l'ecrire en toutes lettres, avant de
proposer de continuer, et non dans une note de bas de page.

Representation destinee a un humain qui le recopie :
**base64url sans remplissage des 32 octets**, soit exactement 43 caracteres
pris dans `A-Z a-z 0-9 - _`. Ni espaces, ni groupement, ni tirets decoratifs :
tout ce qui « aide a lire » finit recopie de travers.

Le sel se conserve dans le `localStorage` du navigateur, sous la cle
`annotepage/sel/<identifiant_projet>`. Le nommage par identifiant de projet
n'est pas cosmetique : deux projets relus depuis le meme navigateur ne doivent
pas s'ecraser l'un l'autre.

Consequence desagreable, a dire : `localStorage` est **par origine**. Le jour
ou la preproduction devient la production, chaque relecteur doit recoller le
sel une fois sur le nouveau domaine. Les notes, elles, ne bougent pas — et
c'est precisement ce que la regle 1.3 achete.

### 1.2 Verification d'un sel saisi

Quand un relecteur colle un sel, le client en derive l'identifiant de projet
(§1.3) et le compare a celui declare par la page. Egaux : le sel est le bon.
Differents : le message est « ce sel n'est pas celui de ce projet », affiche
**avant** toute requete reseau et avant tout dechiffrement.

Il n'y a donc ni somme de controle, ni code de verification a transporter a
cote du sel : l'identifiant de projet joue ce role, il est deja public, et un
mecanisme de moins est un mecanisme de moins a implanter de travers.

### 1.3 Les trois derivations

Une seule fonction, **HKDF-SHA-256** (RFC 5869), appliquee trois fois au meme
sel. C'est ce qui tient la promesse « un seul secret a gerer ».

```
IKM        = les 32 octets du sel               (le secret)
sel HKDF   = "annotepage/1"      en UTF-8       (fixe, public)
info       = "id" | "chiffre" | "index"  en UTF-8
L          = 32 octets pour chaque sortie
```

Piege d'implantation, a nommer parce qu'il se paie cher : le parametre
`salt` de HKDF **n'est pas notre sel**. Notre sel est le materiau d'entree
(IKM). Le `salt` de HKDF est la chaine fixe et publique `annotepage/1`, qui
separe cet outil de tout autre logiciel a qui l'on confierait un jour le meme
secret. Les inverser produit un systeme qui marche, qui chiffre, et dont les
notes deviennent illisibles a la premiere reimplantation.

En WebCrypto :

```js
// La cle maitresse est le sel lui-meme, importe comme materiau HKDF.
const maitresse = await crypto.subtle.importKey(
    'raw', selOctets, 'HKDF', false, ['deriveBits', 'deriveKey']);

const params = (etiquette) => ({
    name: 'HKDF', hash: 'SHA-256',
    salt: utf8('annotepage/1'),   // PAS le sel : voir ci-dessus
    info: utf8(etiquette),
});

const octetsId    = await crypto.subtle.deriveBits(params('id'), maitresse, 256);
const octetsIndex = await crypto.subtle.deriveBits(params('index'), maitresse, 256);
const cleChiffre  = await crypto.subtle.deriveKey(
    params('chiffre'), maitresse,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
```

`cleChiffre` est engendree **non extractible**. C'est de l'hygiene, pas une
barriere : le sel dort dans le `localStorage` juste a cote, et qui lit l'un
refait l'autre en trois lignes. On l'ecrit ici pour que personne ne prenne le
`false` pour une protection qu'il n'est pas.

**identifiant_projet** = base64url sans remplissage des **16 premiers octets**
de `octetsId`, soit 22 caracteres.

Pourquoi 16 et non 32 : cette valeur voyage dans une chaine de requete, dans
un attribut de balise, dans un fichier de configuration PHP et dans une
colonne indexee. 128 bits sont indevinables (il faudrait 2^64 projets pour
esperer une seule collision) et 22 caracteres se recopient. 43 ne se recopient
pas.

**cle_de_chiffrement** = `cleChiffre`, AES-256-GCM. Ne sort jamais du
navigateur, sous aucune forme, y compris derivee.

**cle_index** = les 32 octets de `octetsIndex`, importes en cle HMAC-SHA-256.
Le cahier des charges ecrit `index_page = HMAC(sel, chemin)` ; on n'emploie
pas le sel directement, on emploie une sous-cle qui n'a que cet usage. C'est
la meme decision, resserree : une cle, un usage, toujours.

### 1.4 Ce qui n'entre PAS dans la derivation

**Le domaine n'entre pas dans la cle.** Ni le domaine, ni le prefixe de
chemin, ni l'environnement, ni la version du site.

La raison est operationnelle, pas theorique : le jour ou la preproduction
devient la production, le domaine change. S'il etait dans la derivation,
toutes les notes deviendraient illisibles ce jour-la — c'est-a-dire
exactement le jour ou l'on relit la liste de ce qui reste a corriger.

Le domaine et un prefixe de chemin facultatif definissent la **portee** du
projet : quelles pages lui appartiennent, quelles origines ont le droit de le
consommer. C'est de la configuration (§6.2), jamais de la cryptographie.

---

## 2. Le schema d'une note

Une note et une reponse sont **la meme chose** : une reponse est une note qui
porte un `reponse_a`. Une seule table, une seule profondeur de fil. C'est
l'heritage du format 1, et il n'y a aucune raison d'en changer.

### 2.1 Les colonnes en clair, et pourquoi chacune

Ces champs sont lisibles par l'operateur du serveur, dans les deux modes.
Chacun est la parce que le serveur ne peut pas faire son travail sans lui.

| Colonne | Type | Pourquoi elle reste claire |
|---|---|---|
| `id` | INT UNSIGNED, auto | Il faut bien designer une note pour y repondre ou la marquer corrigee. |
| `projet` | VARCHAR(22) | Le serveur regroupe par projet. Sans elle, un relais melange tout le monde. |
| `index_page` | VARCHAR(22) | Le serveur regroupe par page sans savoir laquelle. Voir §4. |
| `reponse_a` | INT UNSIGNED NULL | La forme du fil. Le serveur imbrique les reponses sans lire un mot. |
| `format` | INT | Le numero de format de CETTE ligne. Voir §5. |
| `mode` | VARCHAR(8) | `clair` ou `chiffre`. Voir §3.4. |
| `cree_le` | DATETIME (UTC) | Ecrit par le serveur. Il connait de toute facon l'heure d'arrivee. |
| `resolue_le` | DATETIME NULL | Ecrit par le serveur. Permet de trier ouvert/corrige sans dechiffrer. |

`cree_le` et `resolue_le` sont ecrits par PHP en UTC, jamais par `NOW()` du
moteur SQL : le fuseau de PHP et celui de la base ne sont pas alignes par
defaut, et une note datee de trois heures dans le futur ferait douter de tout
le reste.

### 2.2 Les colonnes de charge

| Colonne | mode `clair` | mode `chiffre` |
|---|---|---|
| `page` | le chemin reel, `/fr/contact.html` | `''` |
| `selecteur` | le chemin CSS | `''` |
| `empreinte` | balise, identifiant, classes | `''` |
| `extrait` | le texte visible de l'element | `''` |
| `auteur` | le nom saisi | `''` |
| `texte` | la remarque | `''` |
| `version` | la version declaree par le site | `''` |
| `environnement` | l'environnement declare | `''` |
| `fenetre` | `1280x800` | `''` |
| `resolue_par` | le nom du correcteur | `''` |
| `resolue_version` | la version du correctif | `''` |
| `charge` | `''` | l'enveloppe de la note (§3) |
| `charge_resolution` | `''` | l'enveloppe de la resolution (§3.5) |

Le mode `clair` remplit **exactement** les colonnes du format 1 : une base
ecrite par l'outil d'origine est une base de format 2 en mode clair a qui il
manque `projet`, `index_page`, `format`, `mode`, `charge` et
`charge_resolution`. Le rattrapage paresseux de colonnes, deja present dans
`depot.php`, les ajoute au premier appel. Rien a migrer, rien a exporter,
rien a reimporter.

### 2.3 Pourquoi la page et l'auteur sont chiffres, eux aussi

La question se pose serieusement, et la reponse facile est mauvaise.

Si l'on ne chiffrait que `texte`, l'operateur du serveur — c'est-a-dire, en
mode relais, quelqu'un d'autre que le client — lirait :

- **l'arborescence complete du site relu**, page par page, par la colonne
  `page` ;
- **qui travaille dessus**, par la colonne `auteur`, avec leurs noms tels
  qu'ils les ecrivent ;
- **le texte visible de chaque element annote**, par `extrait` : les intitules
  de boutons, les titres, les libelles de formulaire. C'est-a-dire une bonne
  partie du contenu de la page ;
- **la pile technique et le calendrier**, par `version` et `environnement`.

Une preproduction est exactement ce qu'une entreprise ne publie pas encore. La
liste de ses URL, de ses intitules et de ses relecteurs est une fuite, meme
sans une seule remarque.

**Tranche : en mode chiffre, tout ce qui est saisi ou observe passe dans
l'enveloppe.** Le serveur ne conserve en clair que ce qui lui sert a
regrouper, imbriquer et dater. La liste du §2.1 est fermee : ajouter une
colonne claire est un changement de format (§5), pas une commodite.

### 2.4 Ce que le serveur apprend quand meme

Le chiffrement des champs n'est pas une invisibilite. Un operateur de relais
honnete doit pouvoir lire ce qui suit sans se sentir trahi, et un client doit
le savoir avant de choisir le relais :

- le **nombre de projets**, et pour chacun le nombre de notes ;
- le **nombre de pages distinctes** annotees dans un projet, par le nombre de
  valeurs distinctes d'`index_page`, et le nombre de notes par page. Une page
  qui recolte quarante remarques se voit ;
- **l'heure de chaque ecriture**, donc le rythme de la recette, les jours
  travailles, la date de la derniere note ;
- la **forme des fils** : combien de reponses, a quelle vitesse ;
- le **taux et le delai de correction**, par `resolue_le` ;
- la **longueur approximative de chaque remarque**, par la taille de
  l'enveloppe. On ne la masque pas (voir §7) ;
- l'**adresse IP et l'agent utilisateur** de chaque relecteur, comme tout
  serveur HTTP ;
- **en mode relais, le domaine du site relu**, par l'entete `Origin` — que le
  verrou de domaine exige justement de lire (§6.2). Ecrivons-le franchement :
  la promesse n'est pas « le relais ignore quel site vous relisez ». Elle est
  « le relais ne peut lire ni vos chemins, ni vos noms, ni vos remarques ».
- l'`id` est un compteur **global au serveur**. Entre deux notes d'un meme
  projet, l'ecart des identifiants dit combien de notes tous les autres
  projets ont ecrites. Fuite mince, reelle, conservee parce que la corriger
  demanderait une numerotation par projet et son lot de courses (§8).

---

## 3. L'enveloppe de chiffrement

### 3.1 Algorithme

**AES-256-GCM**, par WebCrypto, sans exception et sans repli. Pas de choix
d'algorithme, pas de negociation, pas de « suite » : un format qui negocie est
un format qu'on fait retomber sur son option la plus faible.

- cle : `cle_de_chiffrement` (§1.3), 256 bits ;
- **nonce : 12 octets, tires par `crypto.getRandomValues()` a chaque
  chiffrement.** Jamais un compteur, jamais derive du contenu, jamais reutilise.
  Un nonce repete avec la meme cle en GCM ne fait pas fuir une note : il fait
  fuir la cle d'authentification. Le tirage aleatoire sur 96 bits tient jusqu'a
  environ 2^32 chiffrements par projet — soit quelques milliards de notes, ce
  qui n'arrivera pas ;
- **etiquette d'authentification : 128 bits**, la valeur par defaut de
  WebCrypto, qui la concatene deja au chiffre. On ne la separe pas.

### 3.2 Donnees authentifiees associees (AAD)

L'AAD lie l'enveloppe a sa place. Sans elle, un serveur malveillant peut
deplacer une note d'une page a l'autre, ou d'un projet a l'autre : le
dechiffrement reussirait et la remarque apparaitrait sous un element qu'elle
ne visait pas.

```
AAD = UTF-8( format + "\n" + projet + "\n" + index_page + "\n" + role )
```

`format` est le numero decimal (`2`), `role` vaut `note` ou `resolution`. Les
quatre valeurs sont en base64url ou en chiffres : aucune ne peut contenir de
saut de ligne, la separation est donc sans ambiguite.

### 3.3 Forme serialisee

Une chaine ASCII, en trois champs separes par des points :

```
ap<format>.<nonce base64url>.<chiffre+etiquette base64url>
```

Soit, pour le format 2 :

```
ap2.7Qb1kZ3xNvA9dLpE.qKf2...Zt8
```

- `ap2` : le prefixe **est** le numero de format. Il n'y a pas de second
  compteur pour l'enveloppe : deux numeros de version finissent par diverger,
  et l'un des deux devient un mensonge ;
- base64url **sans remplissage**, pour traverser une chaine de requete, un
  corps `application/x-www-form-urlencoded` et une colonne SQL sans
  echappement ;
- le nonce fait toujours 16 caracteres (12 octets). Un lecteur qui en compte
  un autre refuse la ligne au lieu de deviner.

Le contenu chiffre est un **objet JSON compact, en UTF-8**, avec les noms de
champs de §2.2 :

```json
{"page":"/fr/contact.html","selecteur":"main:nth-of-type(1) > h2:nth-of-type(3)",
 "empreinte":"h2.titre-section","extrait":"Contactez-nous","auteur":"Camille",
 "texte":"Le lien pointe encore vers l'ancien formulaire.",
 "version":"1.4.12","environnement":"preprod","fenetre":"1280x800"}
```

Un champ vide est **absent** de l'objet, il n'est pas ecrit a `""`. Un lecteur
traite l'absence comme la chaine vide — meme regle que dans l'export texte, et
pour la meme raison : ne pas ecrire une cle pour dire qu'il n'y a rien.

**Toute la note tient dans UNE enveloppe**, et non un champ par enveloppe.
Un seul nonce, une seule etiquette, et les longueurs des champs ne se lisent
pas separement. Le prix habituel de ce choix — modifier un champ oblige a
tout rechiffrer — ne se paie pas ici : le texte d'une note n'est jamais
modifie. C'est deja une regle du format 1.

### 3.4 Comment une note porte son mode

La colonne `mode` de chaque ligne vaut `clair` ou `chiffre`. Elle est ecrite
a l'insertion et n'est jamais recalculee.

Cela n'est pas une precaution theorique : une installation peut avoir tourne
en clair pendant deux semaines avant qu'on active le chiffrement, ou avoir
migre d'un auto-heberge vers un relais. **Une base mi-claire mi-chiffree doit
rester entierement lisible**, et le seul moyen est que chaque ligne dise
elle-meme ce qu'elle est. Un drapeau global dans la configuration decrirait
l'installation d'aujourd'hui, pas la ligne d'hier.

Regles de lecture :

- `mode = clair` : les colonnes de §2.2 sont lues telles quelles, `charge` est
  ignoree ;
- `mode = chiffre` : `charge` est dechiffree, les colonnes de §2.2 sont
  ignorees (elles sont vides ; si elles ne le sont pas, elles ne sont pas lues
  pour autant) ;
- `mode` absent ou vide : la ligne vient du format 1, elle vaut `clair` ;
- `mode` inconnu : la ligne est **sautee**, avec un compte affiche. Ni devinee,
  ni rendue vide sans le dire.

Le mode est decide **a l'installation** et vaut pour les notes ecrites
ensuite. Le chiffrement est **actif par defaut**. Il ne se desactive qu'en
auto-heberge, ou il ne protege de rien : les notes sont dans la meme base, sur
la meme machine, derriere la meme restriction d'acces que le site relu. En
mode relais, la desactivation est **impossible** — le serveur refuse une
ecriture `mode=clair` en 400 et le dit.

### 3.5 L'enveloppe de resolution

Marquer une note corrigee ecrit `resolue_par` et `resolue_version`, qui sont
des donnees de charge : elles sont donc chiffrees elles aussi, dans une
**seconde enveloppe**, `charge_resolution`, de role `resolution`.

```json
{"par":"Dominique","version":"1.4.13"}
```

Elle a son propre nonce. Elle est ecrite par une autre personne, a un autre
moment, souvent depuis une autre machine : la fondre dans l'enveloppe de la
note obligerait a rechiffrer une remarque qu'on n'a pas le droit de reecrire.

Rouvrir une note (`resolue=0`) met `resolue_le` a NULL et
`charge_resolution` a la chaine vide. Le fil de reponses n'est pas touche.
C'est le comportement du format 1, mot pour mot.

### 3.6 Bornes

En mode clair, les bornes par champ du format 1 sont conservees :
texte 4000, auteur 80, page 300, selecteur 500, empreinte 255, extrait 300,
version 60, environnement 20, fenetre 20 — en **caracteres**, pas en octets.

En mode chiffre, le serveur ne voit qu'une chaine. La seule borne qu'il puisse
appliquer est **la longueur de l'enveloppe : 24000 caracteres** pour `charge`,
2000 pour `charge_resolution`. Le depassement rend 400 en nommant la limite,
jamais une troncature silencieuse.

Consequence a ecrire, parce qu'elle est desagreable : **en mode chiffre, les
bornes par champ deviennent une convention du client.** Un client modifie peut
ranger 3000 caracteres dans le champ `auteur`, et le serveur l'acceptera : il
ne voit pas de champ `auteur`. C'est le prix du chiffrement de bout en bout,
et il est paye volontiers — l'outil s'adresse a une equipe de recette, pas a
un public hostile.

---

## 4. L'index aveugle

```
index_page = base64url_sans_remplissage(
                 premiers_16_octets( HMAC-SHA-256(cle_index, UTF-8(chemin)) ) )
```

`chemin` est **exactement** ce que produit `location.pathname` : un chemin
absolu commencant par une seule barre, sans schema, sans hote, sans chaine de
requete, sans fragment. Les regles de forme du format 1 s'appliquent avant le
calcul (une seule barre initiale, aucun segment `..`).

Deux points qui font la difference entre deux implantations qui ne se parlent
pas :

- **aucune normalisation autre que celle-la.** Ni minuscules, ni suppression
  d'une barre finale, ni decodage des sequences `%xx`. `/Contact` et
  `/contact` sont deux pages ; `/a/` et `/a` sont deux pages. C'est ce que le
  navigateur donne, c'est ce qu'on indexe ;
- **le calcul est le meme dans les deux modes.** En mode clair, la colonne
  `page` porte en plus le chemin lisible, mais le regroupement se fait
  toujours par `index_page`. Un seul chemin de code, une seule facon de
  grouper. Deux auraient diverge a la deuxieme correction.

Corollaire du mode clair : perdre le sel n'y perd pas les notes — elles sont
lisibles dans la base — mais perd le **regroupement par page**, qu'on ne peut
plus recalculer. On peut alors encore tout lire, plus rien retrouver en
contexte.

### Ce que le serveur peut faire sans dechiffrer

- rendre les notes d'une page : `WHERE projet = ? AND index_page = ?` ;
- imbriquer les reponses sous leur mere, par `reponse_a` ;
- ordonner par `id`, dater, compter ;
- marquer corrige et rouvrir, en posant `resolue_le` ;
- refuser une reponse a une reponse (une seule profondeur), et faire heriter
  une reponse de l'`index_page` de sa mere ;
- servir l'export texte structurel (§5.3).

### Ce qu'il ne peut pas faire

- dire quelles pages existent, ni les enumerer autrement que par leurs index ;
- chercher dans le texte, trier par auteur, compter les notes d'une personne ;
- appliquer un **prefixe de chemin** : il ne voit pas les chemins. La portee
  par prefixe est donc verifiee **par le client**, avant l'envoi. C'est un
  confort de rangement, **pas une frontiere de securite** — qui a
  l'identifiant de projet et le sel ecrit ou il veut.

---

## 5. L'export texte

### 5.1 Le contrat, inchange

La grammaire du format 1 est un contrat, elle est reprise a l'identique.

```
0 espace   ligne de structure d'une note      note 4 / page / element / extrait
2 espaces  ligne de structure d'une reponse   reponse 7 / a la note 4
4 espaces  texte d'une note
6 espaces  texte d'une reponse
```

Une information par ligne, sous la forme « cle valeur ». Une ligne absente
signifie une valeur vide. Une ligne vide separe deux notes. Les dates sont en
ISO 8601 avec decalage explicite. Aucune ponctuation decorative.

L'ecart de **quatre** espaces entre la structure et le texte reste delibere :
a deux, une remarque commencant par le mot « reponse » serait indiscernable
d'un debut de reponse.

La regle de lecture est precisee ici, parce que le format 1 la laissait
implicite et qu'une cle comme `a la note` la contredisait : **la cle n'est pas
le premier mot, c'est le plus long prefixe de la ligne qui figure dans la
liste fermee des cles**, la valeur est le reste. La liste se lit du plus long
au plus court.

Cles emises : `note`, `page`, `index-page`, `element`, `extrait`, `mode`,
`reponse`, `a la note`, `auteur`, `date`, `version`, `environnement`,
`fenetre`, `etat`, `corrigee`, `texte`.

Le format se defend lui-meme, dans les deux sens : tout ce qu'un lecteur
compte pour une fin de ligne — `\r\n`, `\r`, U+0085, U+2028, U+2029 — est
ramene a un simple saut de ligne, a l'ecriture **et** a la relecture, et les
caracteres de controle autres que `\n` et `\t` sont retires. Sans quoi une
note fabrique, DANS l'export, une note entiere qui n'a jamais ete ecrite. En
mode chiffre, ce nettoyage a lieu **apres** le dechiffrement, chez le
producteur de l'export : c'est la seule place ou le texte existe.

### 5.2 L'en-tete

Le format 1 ecrivait quatre lignes. On en ajoute, jamais on n'en change :

```
outil annotepage
format 2
version 2.0.0
projet 7Qb1kZ3xNvA9dLpEqKf2Zt
chiffrement oui
export 2026-08-31T09:14:22+00:00
notes 128
```

`chiffrement` vaut `oui`, `non` ou `mixte`. `mixte` est le cas normal d'une
installation qui a change d'avis : il se dit, il ne se cache pas.

### 5.3 Deux producteurs, une seule grammaire

C'est le point de ce chapitre.

**En mode clair, le serveur produit l'export**, comme aujourd'hui, octet pour
octet comme le format 1 (aux lignes d'en-tete pres).

**En mode chiffre, le serveur ne le peut pas** : il n'a ni les chemins, ni les
noms, ni les textes. Il produit alors un **export structurel** — la meme
grammaire, avec les seules lignes qu'il connait :

```
note 4
index-page 9dLpEqKf2Zt8ArC1vX
mode chiffre
date 2026-08-30T14:02:11+00:00
etat ouverte
```

Les cles qu'il ne peut pas remplir sont **absentes**, ce qui, par le contrat,
veut exactement dire « valeur vide ». Aucune ligne `texte` n'est emise : une
ligne `texte` suivie de rien annoncerait une remarque vide, ce qui serait faux.
Un lecteur qui recupere cet export sait donc, sans ambiguite et sans code
special, qu'il lui manque le sel.

**L'export complet en mode chiffre est produit par `@annotepage/mcp`**, qui a
le sel : il lit `?action=texte`, dechiffre chaque enveloppe et emet la
grammaire ci-dessus, **remplie**, avec les memes marges et les memes cles. Un
outil qui lit l'export ne sait pas — et n'a pas a savoir — lequel des deux
producteurs l'a ecrit.

`mode chiffre` n'est emis que pour une note chiffree. Une note claire n'a pas
de ligne `mode`, et une note du format 1 non plus : la meme absence, la meme
signification. Les exports du format 1 restent donc valides tels quels.

### 5.4 Ce que l'export expose

Rempli, il contient des noms et des remarques internes. Il n'a rien a faire
sur un site ouvert — c'etait vrai au format 1, ca l'est toujours. Ce qui
change : en mode chiffre, l'adresse `?action=texte` ne rend plus que la
structure, et le document reellement lisible n'existe que sur la machine qui
detient le sel.

---

## 6. Les cinq adresses

Relatives au prefixe de montage. Les cinq du format 1, avec l'identifiant de
projet ajoute.

```
GET  <base>/api.php?action=liste&projet=<id>&index=<index_page>
POST <base>/api.php?action=ajout
POST <base>/api.php?action=resoudre
GET  <base>/api.php?action=texte&projet=<id>
GET  <base>/api.php?action=diagnostic
```

Les deux ecritures restent en POST, jamais en GET : une action qui change
l'etat ne doit pas partir d'un lien qu'on suit ou qu'un aspirateur explore.
Une action inconnue rend 400 et la liste ci-dessus, jamais un corps vide.

### 6.1 Champs

**`liste`** — `projet`, `index`. Le chemin reel n'est **jamais** envoye, dans
aucun mode : envoyer le chemin en mode clair et l'index en mode chiffre ferait
deux chemins de code, et le second serait le moins teste.

Reponse : `{"ok":true,"outil":"annotepage","format":2,"version":"...",
"projet":"...","index":"...","notes":[...]}`. Chaque note porte ses colonnes
claires (§2.1), ses colonnes de charge (§2.2) et ses reponses imbriquees.

**`ajout`** — `application/x-www-form-urlencoded`. On ne passe pas au JSON :
un corps urlencode est une « requete simple » au sens CORS et n'entraine pas
de requete preliminaire, ce qui evite au relais toute une machinerie de
`OPTIONS`.

| Champ | Toujours | Mode clair | Mode chiffre |
|---|---|---|---|
| `projet` | oui | | |
| `index` | note nouvelle | | |
| `mode` | oui | `clair` | `chiffre` |
| `reponse_a` | reponse | | |
| `charge` | | — | l'enveloppe |
| `auteur`, `texte` | | obligatoires | — |
| `page`, `selecteur`, `empreinte`, `extrait` | | note nouvelle | — |
| `version`, `environnement`, `fenetre` | | facultatifs | — |

Une reponse **herite** de `index_page` et, en mode clair, de la page, du
selecteur, de l'empreinte et de l'extrait de sa mere. Les redemander au client
ouvrirait la porte a une reponse rattachee ailleurs que la note qu'elle
commente. Une reponse a une reponse est refusee en 400.

**`resoudre`** — `projet`, `id`, `resolue` (0 rouvre, defaut 1), plus
`charge_resolution` en mode chiffre, ou `par` et `version` en mode clair. Le
nom n'est obligatoire que pour marquer une correction : c'est lui qui signe.
Pour rouvrir, on ne demande pas le nom du correcteur pour annuler la
correction.

**`texte`** — `projet`. Rend l'export complet en mode clair, structurel en
mode chiffre (§5.3).

**`diagnostic`** — aucun parametre, et surtout aucun `projet`. Il rend l'etat
du serveur, jamais des notes. Il n'affiche **jamais** un identifiant de projet
en entier : six caracteres suffisent a confirmer qu'on regarde le bon, et
l'identifiant est ce qui donne acces aux lignes.

### 6.2 Le verrou de domaine

Chaque projet declare, dans la configuration du serveur, la liste des origines
autorisees a le consommer :

```
projet 7Qb1kZ3xNvA9dLpEqKf2Zt
  origines  https://preprod.exemple.fr, https://www.exemple.fr
  mode      chiffre
```

Un projet peut en declarer plusieurs, et c'est voulu : une preproduction et
la production qu'elle devient sont le meme projet, avec les memes notes. C'est
le pendant operationnel de la regle « le domaine n'entre pas dans la cle ».

Regle appliquee :

- entete `Origin` present et absent de la liste : **403**, en `text/plain` ;
- `Origin` present et reconnu : la reponse porte
  `Access-Control-Allow-Origin: <l'origine verifiee>`, jamais `*` ;
- `Origin` absent : en auto-heberge, autorise (une requete de meme origine
  n'en envoie pas). En relais, **toute ecriture est refusee** — un navigateur
  envoie toujours `Origin` sur une requete d'origine differente.

**Ce que ce verrou est, et ce qu'il n'est pas.** C'est une mesure
**anti-abus** : elle empeche un autre site de consommer un identifiant de
projet trouve dans le code source d'une page, d'y ecrire du bruit et d'y user
le quota du relais.

**Ce n'est pas une protection contre les XSS**, et il ne faut jamais le
presenter ainsi. Une XSS s'execute **dans** la page visee, donc avec l'origine
legitime : elle passe le verrou sans effort, et elle a de toute facon acces au
`localStorage`, donc au sel. Une XSS sur une page annotee compromet les notes
du projet, point.

### 6.3 Ce que l'identifiant de projet donne

L'identifiant de projet est un **jeton porteur** : qui l'a peut lire les
lignes du projet et en ecrire. Il n'y a pas d'authentification, et c'est
assume — c'etait deja le cas au format 1.

- en mode **chiffre**, ces lignes sont inexploitables sans le sel. Le jeton
  seul donne ce que le §2.4 enumere, rien de plus ;
- en mode **clair**, ces lignes sont lisibles. C'est exactement pourquoi le
  mode clair est reserve a l'auto-heberge, ou l'API est derriere la meme
  restriction d'acces que le site relu.

Les deux phrases precedentes sont le meme argument, et il ferme la boucle :
le mode clair est impossible en relais parce que le relais n'a pas de
restriction d'acces a offrir.

### 6.4 Le silence

La regle du format 1 est conservee mot pour mot. `?action=liste` sur un outil
depose mais **pas configure**, ou sur un projet inconnu, repond **200** avec
`{"ok":false,"actif":false}` et non 404 : un code d'erreur HTTP est journalise
par le navigateur lui-meme, dans la console de chaque page, sans qu'aucun code
puisse l'en empecher. Les autres actions, qu'un humain appelle a la main,
gardent leur 404 explique.

---

## 7. Le numero de format et sa regle d'evolution

Le numero de format est un **entier**, sans point. Il vaut **2**.

Il apparait a trois endroits, et les trois doivent s'accorder : la colonne
`format` de chaque ligne, le prefixe `ap<n>` de chaque enveloppe, la ligne
`format` de l'en-tete d'export.

Il est **par ligne**, pas par installation. Une base peut porter des lignes de
format 1, 2 et 3 : chacune se lit selon le sien. C'est la meme decision que le
`mode` par note, pour la meme raison.

### Ce qui NE change PAS le numero

- ajouter une cle a l'export texte ;
- ajouter un champ facultatif dans l'objet JSON de l'enveloppe ;
- ajouter une colonne claire dont l'absence est sans consequence ;
- ajouter une action a l'API, ou un champ facultatif a une action.

Ces changements sont sans risque **parce que la regle de lecture est
imperative** : un lecteur **ignore en silence** toute cle d'export inconnue,
tout champ JSON inconnu, toute colonne inconnue. Un lecteur qui echoue sur ce
qu'il ne connait pas rend la premiere addition impossible.

### Ce qui change le numero

- toute modification des derivations : l'algorithme, les longueurs, les
  etiquettes `id` / `chiffre` / `index`, la chaine `annotepage/1` ;
- tout changement d'algorithme ou de forme d'enveloppe, y compris de la
  composition de l'AAD ;
- tout changement de la construction de `index_page` ;
- toute modification du sens d'une cle d'export existante, de la liste des
  marges, ou de la regle des quatre espaces ;
- rendre obligatoire un champ qui ne l'etait pas.

### Comment un lecteur se comporte devant un format qu'il ne connait pas

Deux comportements, et la difference compte :

- **enveloppe de numero superieur** : refus net. On ne devine pas une
  cryptographie. La note est sautee et comptee, l'outil dit « cette note a ete
  ecrite par une version plus recente d'annotepage » ;
- **export texte de numero superieur** : lecture quand meme, en ignorant les
  cles inconnues. La grammaire des marges est stable par construction, et un
  export a moitie lu vaut mieux qu'un refus.

Les etiquettes de derivation sont **gelees** par le numero de format. Changer
`"chiffre"` en `"chiffrement"` rend illisible chaque note deja ecrite. Si cela
devait arriver un jour, ce serait le format 3, avec une lecture des deux.

---

## 8. Ce que cette specification ne tranche pas

Rien de ce qui suit n'empeche d'implanter le format 2. Ce sont des questions
ouvertes, listees pour qu'elles ne se referment pas par accident.

1. **Le remplissage des enveloppes.** La longueur de l'enveloppe donne la
   longueur de la remarque, a quelques octets pres. Un remplissage au multiple
   de 256 octets le masquerait, au prix d'un champ de longueur dans le clair et
   d'un cout en stockage. Non specifie : les enveloppes ne sont pas remplies.
   Si on le fait un jour, c'est un champ JSON de bourrage, donc sans changement
   de numero de format.

2. **La rotation du sel.** Il n'existe aucun mecanisme. Un sel qui fuit oblige
   a repartir d'un projet neuf, en abandonnant les notes. Un rechiffrement de
   masse suppose que quelqu'un detienne l'ancien et le nouveau sel et
   reecrive toutes les lignes — ce qui contredit le modele en ajout seul.
   A trancher avant de promettre quoi que ce soit sur ce point.

3. **Comment le sel atteint le deuxieme relecteur.** Hors bande, par un canal
   que l'outil ne fournit pas. Le fragment d'URL (`#sel=...`) n'est pas envoye
   au serveur et serait commode, mais il se depose dans l'historique du
   navigateur et dans tout ce qui journalise des URL. Non tranche.

4. **Ce qu'un serveur MCP a le droit de faire seul.** Il detient le sel, donc
   tout. Peut-il marquer une note corrigee sans qu'un humain confirme ? Ecrire
   une note de son propre chef ? Le format le permet ; la politique n'est pas
   ecrite.

5. **La pagination de `?action=texte`.** Le format 1 rend tout, en flux. Un
   projet de dix mille notes rend un document que personne ne lit et qu'aucun
   modele n'avale. Ni bornes, ni filtre par etat, ni filtre par date.

6. **Le quota et la retention en mode relais.** Combien de projets, combien de
   notes par projet, que devient un projet qu'on n'a pas touche depuis un an.
   Le verrou de domaine limite l'abus depuis un autre site, pas depuis un
   client fabrique.

7. **La numerotation des notes.** Globale au serveur aujourd'hui (§2.4). Une
   numerotation par projet supprimerait la fuite et rendrait les numeros plus
   lisibles dans l'export, au prix d'un compteur a tenir sans course entre
   deux ecritures simultanees.

8. **Le comportement quand deux projets declarent la meme origine.** Rien ne
   l'interdit, rien ne le decrit. Une page portant deux balises, deux
   identifiants et deux sels n'est ni prevue ni refusee.
