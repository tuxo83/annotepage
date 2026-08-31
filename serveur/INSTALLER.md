# annotepage — le serveur

Le serveur PHP d'annotepage. Il enregistre les notes, les regroupe par projet
et par page, et les rend — en JSON au client, en texte brut a un assistant.

**Un seul code, deux endroits ou le poser.** C'est le point a comprendre avant
tout le reste :

| | auto-heberge | relais |
|---|---|---|
| ou | sur le site relu lui-meme | sur une machine tierce |
| projets | un seul | autant qu'on veut |
| chiffrement | actif par defaut, desactivable | actif, **non desactivable** |
| entete `Origin` | facultatif | exige a l'ecriture |
| reprise d'une base 1.2.0 | disponible | refusee |

Il n'y a pas deux implantations : c'est la meme table, la meme requete, le
meme fichier. La configuration declare `deploiement`, et cette valeur ne
change que les trois lignes du tableau ci-dessus.

Le serveur n'est **pas** un paquet npm. Il se recopie.

---

## Ce qu'il exige, et rien de plus

- Apache (ou tout serveur qui execute du PHP) ;
- **PHP 7.4 ou plus recent**, avec `pdo_mysql` et `json` ;
- **une base MySQL** et un utilisateur qui peut y ecrire.

Aucune dependance a installer, aucune etape de construction, aucun paquet, rien
a compiler. On recopie un dossier, on depose un fichier, on ajoute une balise.

---

## Ce que le serveur ne connait pas, et ne connaitra jamais

**Le sel.** Il est engendre a l'installation, dans le navigateur, sur 256 bits.
Il ne quitte pas le navigateur : le serveur ne le recoit a aucun moment, sous
aucune forme, dans aucun mode. Rien de ce qui est ecrit dans ce document ne
demande de l'y mettre.

**Sel perdu = notes perdues.** Il n'y a pas de recuperation, pas de question
secrete, pas de tiers de sequestre. Le serveur ne peut rien y faire, et c'est
le prix de ce qu'il achete : l'operateur d'un relais ne peut pas lire les
notes qu'il heberge.

Ce que le serveur connait, c'est l'**identifiant de projet** : 22 caracteres,
derives du sel par HKDF, sans retour possible. Il est public — il figure dans
la balise de chaque page annotee — et c'est lui qu'on ecrit dans la
configuration.

---

## Le poser sur un site, en trois gestes

### 1. Recopier `racine-web/`

Quelque part sous la racine web, sous le nom qu'on veut :

```
/var/www/<site>/html/notes/         <- racine-web/ recopie ici
```

Ne recopiez que `racine-web/`. Le reste du dossier (ce fichier) n'a rien a
faire en ligne, et le decoupage est fait ici pour qu'une liste d'exclusion
n'ait pas a l'etre ailleurs.

### 2. Deposer `interne/configuration-locale.php`

En partant de `interne/configuration-locale.exemple.php`. **Sans lui, l'outil
est INACTIF** : le defaut sur est le silence, pas une connexion tentee au
hasard. Un dossier recopie par erreur ne fait donc strictement rien.

Trois choses a y ecrire, et une seule est nouvelle par rapport a l'outil
d'origine :

```php
'deploiement' => 'auto-heberge',      // ou 'relais'

'projets' => array(
    '7Qb1kZ3xNvA9dLpEqKf2Zt' => array(
        'origines' => array('https://preprod.exemple.fr',
                            'https://www.exemple.fr'),
        'mode'     => 'chiffre',
    ),
),

'base' => array( /* hote, port, nom, utilisateur, motdepasse */ ),
```

L'**identifiant de projet** (`7Qb1kZ...`) est celui que l'ecran d'installation
du client affiche apres avoir engendre le sel. Recopiez-le : le serveur ne le
calcule pas, il le reconnait. Le meme identifiant doit figurer des deux
cotes — dans ce fichier et dans la balise de la page.

Chaque identifiant de base s'ecrit au choix en clair ou sous la forme
`array('fichier' => '/chemin/absolu')`, ce qui permet de LIRE un secret depose
hors de la racine web sans jamais le recopier dans un fichier servi.

**Les origines** sont celles que le navigateur envoie : `schema://hote[:port]`,
sans chemin et sans barre finale. Un projet peut en declarer plusieurs, et
c'est voulu : une preproduction et la production qu'elle devient sont le meme
projet, avec les memes notes.

### 3. Ajouter la balise du client sur les pages a annoter

C'est le paquet `@annotepage/client` qui documente cette balise. Ce qui compte
pour le serveur : elle porte le **meme identifiant de projet** que la
configuration ci-dessus, et le client deduit l'adresse de l'API de la sienne.
Le prefixe de montage est donc libre.

---

## Verifier, d'une seule requete

```
https://<site>/notes/api.php?action=diagnostic
```

Rend, en texte brut : la version de PHP REELLEMENT servie, les extensions
presentes, le mode de deploiement, les projets declares avec leurs origines,
la lisibilite des fichiers d'identifiants, l'etat du stockage — table presente,
colonnes manquantes, index manquants, nombre de notes — et ce qu'il reste a
reprendre d'une base 1.2.0.

Trois regles y sont tenues sans exception :

- aucune **valeur** d'identifiant de base n'y figure, jamais, ni meme sa
  longueur : on dit d'ou elle vient et si elle est lisible ;
- un identifiant de **projet** n'y parait que par ses six premiers caracteres.
  Six suffisent a confirmer qu'on regarde le bon, et l'identifiant entier est
  ce qui donne acces aux lignes ;
- **aucun effet**. Le diagnostic ne cree pas la table qu'il vient chercher, ne
  complete pas un schema, ne rattache aucune ligne.

Il repond MEME quand la configuration locale est illisible, mal formee, ou
qu'elle declare un projet invalide : il nomme alors le fichier et la cause.
C'est justement le moment ou l'on n'a que lui.

Les origines, elles, sont affichees **en entier** : ce sont des noms de domaine
publics, et c'est la ligne qu'on vient comparer caractere par caractere avec
ce que le navigateur envoie. `http` contre `https`, un port, une barre
finale : ce sont les trois erreurs, et aucune ne se voit sans les deux chaines
cote a cote.

---

## Mettre a jour le serveur la ou il a deja tourne

Rien a faire : recopier `racine-web/` par-dessus suffit. Au premier appel,
l'outil complete son stockage — les colonnes ET les index qu'une version
anterieure n'avait pas crees sont ajoutes.

Si l'utilisateur de la base n'a pas le droit de le faire, le message rend **le
SQL exact** a executer une fois, et `?action=diagnostic` liste ce qui manque.

Un index qui ne peut pas etre cree n'interrompt rien : il rend les requetes
lentes, pas fausses, et refuser de servir les notes pour cela serait une panne
fabriquee. Le diagnostic le dit.

---

## Reprendre une base « notes en contexte » 1.2.0

**Aucune note n'est perdue, jamais, et il n'y a rien a exporter ni a
reimporter.** Une table ecrite par l'outil d'origine est une table de format 2
en mode clair a qui il manque six colonnes ; le rattrapage les ajoute au
premier appel, et les lignes existantes se lisent alors comme ce qu'elles
sont : des lignes de format 1, en clair.

Deux colonnes ne se remplissent pas de la meme facon :

- **`projet`** : le serveur la remplit seul, mais uniquement en auto-heberge
  avec **un seul** projet declare — c'est le seul cas ou le proprietaire des
  lignes est connu sans ambiguite. C'est fait une fois, au moment ou la colonne
  apparait. Declarez donc votre projet **avant** le premier appel apres la mise
  a jour ;
- **`index_page`** : le serveur ne peut **pas** la calculer. Elle vaut
  `HMAC(cle_index, chemin)`, et la cle descend du sel, qui ne quitte jamais le
  navigateur. C'est le prix, assume, de l'index aveugle.

Tant que l'index n'est pas pose, les anciennes notes **sortent bien** dans
`?action=texte` mais **ne se regroupent pas** sous leur page dans le panneau.
C'est desagreable, c'est visible dans le diagnostic
(`reprise.notes_sans_index`), et cela se corrige en une passe :

```
GET  api.php?action=reprise&projet=<id>
     -> { "pages": ["/fr/contact.html", "/fr/tarifs.html", ...],
          "rattachees": 128 }

POST api.php?action=reprise
     projet=<id>&page=/fr/contact.html&index=<index calcule par le client>
     -> { "touchees": 7, "restantes": 12 }
```

Le client calcule l'index de chaque chemin — il a le sel — et le renvoie, un
chemin par requete. L'operation est **idempotente** : seules les lignes qui
n'ont pas encore d'index sont touchees, si bien qu'une reprise rejouee ne peut
pas reecrire l'index d'une note recente.

Cette action est refusee en mode relais : un relais n'a jamais eu de base 1.2.0
a reprendre, et elle enumere des chemins de page **en clair**, ce qui n'a de
sens que sur le site relu lui-meme. Elle pourra disparaitre le jour ou plus
aucune base 1.2.0 ne tourne.

**Passer une base reprise en mode chiffre** ne se retro-applique pas : les
notes deja ecrites restent claires, les suivantes sont chiffrees, et chaque
ligne dit elle-meme ce qu'elle est. L'export l'annonce par
`chiffrement mixte`. C'est le cas normal d'une installation qui a change
d'avis ; il se dit, il ne se cache pas.

---

## Les adresses

Relatives au prefixe de montage.

```
GET  <base>/api.php?action=liste&projet=<id>&index=<index>  les notes d'une page (JSON)
POST <base>/api.php?action=ajout                            ecrire une note ou une reponse
POST <base>/api.php?action=resoudre                         marquer corrigee, ou rouvrir
GET  <base>/api.php?action=texte&projet=<id>                toutes les notes (texte brut)
GET  <base>/api.php?action=diagnostic                       etat du serveur (texte brut)
GET|POST <base>/api.php?action=reprise                      maintenance, voir ci-dessus
```

Les deux ecritures sont en POST, jamais en GET : une action qui change l'etat
ne doit pas partir d'un lien qu'on suit ou qu'un aspirateur explore. Une action
inconnue rend 400 et la liste ci-dessus, jamais un corps vide.

**Le chemin reel n'est jamais envoye a `liste`, dans aucun mode** — seul
l'index aveugle l'est. Envoyer le chemin en clair et l'index en chiffre ferait
deux chemins de code, et le second serait le moins teste.

Le corps des ecritures est `application/x-www-form-urlencoded`, et non du
JSON : c'est une « requete simple » au sens CORS, qui n'entraine aucune requete
preliminaire. Le relais n'a donc aucune machinerie de `OPTIONS` a tenir. Si
vous voyez passer des `OPTIONS` dans un journal, c'est qu'un client envoie un
entete qu'il ne devrait pas.

`?action=texte` est faite pour etre lue par un humain ou par un assistant qui
recupere la page en HTTP : une information par ligne, aucune ponctuation
decorative, quatre marges qui disent la structure. La grammaire est un contrat
et elle est decrite dans `FORMAT.md`. En mode clair, elle rend l'export
complet ; en mode chiffre, elle rend la structure **plus les enveloppes**, que
seul `@annotepage/mcp` peut ouvrir. Elle expose des noms et des remarques
internes : elle n'a rien a faire sur un site ouvert.

---

## Le verrou de domaine

Chaque projet declare ses origines. La regle appliquee :

- `Origin` present et **absent** de la liste : **403**, en `text/plain` — y
  compris sur `liste`. La regle du silence protege l'installation pas encore
  configuree ; elle n'a pas a proteger le site qui essaie de consommer le
  projet d'un autre ;
- `Origin` present et **reconnu** : la reponse porte
  `Access-Control-Allow-Origin: <l'origine verifiee>`, **jamais** `*` ;
- `Origin` **absent** : autorise en auto-heberge (une requete de meme origine
  n'en envoie pas). En relais, toute **ecriture** est refusee — un navigateur
  envoie toujours `Origin` sur une requete d'origine differente.

**Ce que ce verrou est** : une mesure **anti-abus**. Il empeche un autre site
de ramasser un identifiant de projet dans le code source d'une page, d'y ecrire
du bruit et d'y user le quota du relais.

**Ce qu'il n'est pas, et il ne faut jamais le presenter ainsi** : une
protection contre les XSS. Une XSS s'execute **dans** la page visee, donc avec
l'origine legitime : elle passe le verrou sans effort, et elle a de toute
facon acces au `localStorage` de cette origine, donc au sel. Une XSS sur une
page annotee compromet les notes du projet, point.

---

## Limitation de debit et plafonds

Un relais public verra des abus des le premier jour.

**Ce qui est compte** : les ecritures (`ajout`, `resoudre`) et les exports
(`texte`), sur une fenetre fixe, avec deux compteurs — un par adresse, un par
projet. **Ce qui ne l'est pas** : `liste`. La compter couterait une ecriture en
base par chargement de page, pour se defendre d'une requete qui ne fait
grossir personne. La consequence est ecrite plutot que tue : une boucle de
`liste` sur un index connu n'est bornee par rien ici ; si cela devenait un
probleme, la reponse serait un plafond devant PHP, pas un compteur en base a
chaque lecture.

Defauts, tous configurables, `0` desactivant le compteur correspondant :

```php
'debit_fenetre_secondes'     => 300,
'debit_ecritures_par_ip'     => 120,
'debit_ecritures_par_projet' => 300,
'debit_exports_par_ip'       => 20,
'plafond_corps_octets'       => 65536,
'plafond_notes_par_projet'   => 0,     // 0 = sans limite
```

Un depassement rend **429** avec un entete `Retry-After` et une phrase qui dit
combien de temps attendre. Rien n'est enregistre, et le texte saisi n'est pas
perdu.

Le compteur vit dans la base, table `<prefixe>debit` : l'outil n'ecrit aucun
fichier, et il n'y a ni cache partage ni tache planifiee sur ce genre
d'hebergement. Le menage des fenetres depassees est opportuniste.

**Quand le compteur lui-meme est en panne** : on refuse en relais — un relais
sans compteur est un relais qui sera rempli, et son operateur en est
comptable ; on laisse passer en auto-heberge, ou l'interruption coute plus cher
que le risque. Les deux cas sont journalises.

Derriere un mandataire, `REMOTE_ADDR` est celle du mandataire et tous les
clients partagent un compteur. Declarez alors `entete_ip_client`, **et
seulement si le mandataire reecrit cet entete a chaque requete** : un entete
que le client ecrit lui-meme rendrait la limitation contournable en une ligne.

Le quota et la retention en mode relais restent **ouverts** : `FORMAT.md` §8.6
ne les tranche pas. `plafond_notes_par_projet` est un outil, pas une
politique — il n'efface rien, ne fait expirer rien, et refuse l'ecriture
au-dela en le disant.

---

## Ce que le serveur apprend quand meme, en mode chiffre

Le chiffrement des champs n'est pas une invisibilite. Un operateur de relais
honnete doit pouvoir lire ce qui suit sans se sentir trahi, et un client doit
le savoir **avant** de choisir le relais :

- le nombre de projets, et pour chacun le nombre de notes ;
- le nombre de pages distinctes annotees, et le nombre de notes par page — une
  page qui recolte quarante remarques se voit ;
- l'heure de chaque ecriture, donc le rythme de la recette, les jours
  travailles, la date de la derniere note ;
- la forme des fils, le taux et le delai de correction ;
- la longueur approximative de chaque remarque, par la taille de l'enveloppe ;
- l'adresse IP et l'agent utilisateur de chaque relecteur, comme tout serveur
  HTTP ;
- **en mode relais, le domaine du site relu**, par l'entete `Origin` — que le
  verrou de domaine exige justement de lire. Disons-le franchement : la
  promesse n'est pas « le relais ignore quel site vous relisez ». Elle est
  « le relais ne peut lire ni vos chemins, ni vos noms, ni vos remarques ».

L'identifiant de note est un compteur **global au serveur**. Entre deux notes
d'un meme projet, l'ecart des identifiants dit combien de notes tous les autres
projets ont ecrites. Fuite mince, reelle, conservee : la corriger demanderait
une numerotation par projet et son lot de courses.

---

## Ce qu'il ne fait pas

C'est un choix, pas un oubli :

- **pas d'authentification.** L'identifiant de projet est un jeton porteur :
  qui l'a peut lire les lignes du projet et en ecrire. En mode chiffre, ces
  lignes sont inexploitables sans le sel. En mode clair, elles sont lisibles —
  et c'est exactement pourquoi le mode clair est reserve a l'auto-heberge, ou
  l'API est derriere la meme restriction d'acces que le site relu. Les deux
  phrases ferment la boucle : le mode clair est impossible en relais parce que
  le relais n'a pas de restriction d'acces a offrir ;
- **pas de moderation, et aucune suppression.** Une note posee reste. Le seul
  etat qu'elle puisse changer est « corrigee », et cette marque se revient. Le
  texte d'une note n'est jamais modifie, ce qui fait que plusieurs personnes
  annotent en meme temps sans verrou et sans conflit ;
- **pas de notification, pas d'export ailleurs** ;
- **pas de pagination de `?action=texte`.** Un projet de dix mille notes rend
  un document que personne ne lit. Ni bornes, ni filtre par etat, ni filtre par
  date : `FORMAT.md` §8.5 ne le tranche pas ;
- **pas de rotation du sel.** Il n'existe aucun mecanisme, ni ici ni ailleurs.
  Un sel qui fuit oblige a repartir d'un projet neuf.

---

## Deux comportements a connaitre

**Il se retire en silence quand il n'a rien a faire.** Outil depose mais pas
configure, ou projet inconnu : `?action=liste` repond **200** avec
`{"ok":false,"actif":false}` et non 404. Un code d'erreur HTTP est journalise
par le navigateur LUI-MEME, dans la console de chaque page, sans qu'aucun code
puisse l'en empecher. Mesure : 3 messages de console avec le 404, 2 sans —
soit exactement ceux de la page nue. Les autres actions, qu'un humain appelle
a la main, gardent leur 404 explique.

**Mais une fois en place, il ne se tait plus.** Toute panne s'affiche, avec le
message que le serveur a redige. Les en-tetes de partage sont poses sur les
reponses d'erreur **aussi**, pour qu'un 503 traverse la frontiere d'origine et
arrive a l'ecran du relecteur : une erreur que le navigateur masque est un
echec muet, et une remarque qu'on croit enregistree et qui ne l'est pas est
pire que pas d'outil du tout.

---

## Ce qu'il y a dans le dossier

```
INSTALLER.md                   ce fichier — jamais publie
racine-web/                    LA SEULE partie servie par le serveur web
  VERSION                      version de l'OUTIL (SemVer), independante de
                               celle du site qui l'accueille. Elle est DANS la
                               partie servie, et non a la racine du dossier,
                               pour que le diagnostic puisse la lire en ligne :
                               un second fichier a la racine finirait par
                               diverger de celui-la
  api.php                      point d'entree HTTP unique
  interne/configuration.php    defauts + fusion du fichier local
  interne/origines.php         projets declares, verrou de domaine, partage
  interne/entrees.php          bornes et nettoyage de tout ce qui vient du web
  interne/debit.php            limitation de debit et plafonds de taille
  interne/depot.php            LE SEUL endroit qui parle a la base
  interne/sortie-texte.php     le format de la lecture a distance
  interne/erreurs.php          l'ecran blanc n'est jamais une reponse
```

Tout ce qui est sous `interne/` refuse de s'executer sans une constante posee
uniquement par `api.php`, et repond 404 si on l'appelle directement. Le
`.htaccess` qui s'y trouve ne fait que doubler : la prise en compte de ses
directives depend du `AllowOverride` du serveur, qui n'est pas toujours connu,
et on ne fait jamais reposer une protection sur ce seul fichier.
