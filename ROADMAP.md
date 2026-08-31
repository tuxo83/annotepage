# Ce qui reste a faire, et ce qu'on a decide de ne pas faire tout de suite

Une entree = un sujet, sa raison d'etre, et les pieges deja reperes. Ce qui
n'est pas encore tranche est marque comme tel : ce fichier ne decide pas a la
place du mainteneur.

---

## Captures d'ecran jointes aux notes

**Pourquoi.** Les outils concurrents (BugHerd, Marker.io, Usersnap) joignent
une capture a chaque remarque. Aujourd'hui une note d'annotepage porte la page,
le selecteur, un extrait de texte, la version, l'environnement et la taille de
fenetre — c'est deja beaucoup, mais ca ne montre pas ce que la personne a VU.
Or l'experience de ce projet est claire : plusieurs fois, la description seule
a envoye la correction dans la mauvaise direction, et c'est une capture qui a
tranche.

**A REGARDER, pas encore decide.** Quatre difficultes reelles, a peser avant de
se lancer :

1. **Le poids.** Une note pese quelques centaines d'octets ; une capture, des
   centaines de kilo-octets — mille fois plus. Ca change le dimensionnement du
   stockage, et l'economie d'un relais public partage.
2. **Le chiffrement.** Si le chiffrement est actif, la capture doit l'etre
   aussi, cote navigateur. Le relais devient alors incapable d'en fabriquer une
   vignette : l'affichage doit tout dechiffrer pour montrer quoi que ce soit.
3. **La vie privee, et c'est le point le plus serieux.** Une capture prise sur
   une preproduction peut contenir des donnees reelles affichees a l'ecran —
   un nom, une adresse, un dossier client. La remarque, elle, n'en contient
   presque jamais. Joindre une image change la nature de ce qu'on stocke.
4. **La fidelite.** Une capture rasterisee vieillit mal et ne se cherche pas.
   Une capture du DOM de l'element (son HTML et ses styles calcules) pese mille
   fois moins, se relit, se compare — et suffit peut-etre a l'usage reel.

**Pistes, par cout croissant :** capturer seulement la boite de l'element vise
plutot que la page entiere ; ou capturer le DOM plutot qu'une image ; ou la
page entiere, en option desactivable par defaut.

---

## Positionnement du produit — a refleter dans le site et le README

Constate en examinant les projets voisins : cusdis, remark42, giscus,
utterances, umami sont des SYSTEMES DE COMMENTAIRES — des lecteurs qui
commentent un article publie. Meme forme technique qu'annotepage (un widget,
un serveur auto-hebergeable, une option hebergee), metier different.

**Les concurrents reels sont BugHerd, Marker.io et Usersnap** : du SaaS payant,
sans auto-hebergement, sans boucle IA.

Ce qui NE differencie PAS, et qu'il ne faut donc pas mettre en avant :
- le serveur public par defaut + l'auto-hebergement : c'est le standard de la
  famille, tout le monde le fait ;
- « ultra simple » : tout le monde le revendique.

Ce qui differencie, et qu'il faut montrer : **la boucle fermee**. Le relecteur
annote, l'IA lit, corrige, REPOND DANS LE FIL en disant ce qu'elle a mesure,
puis ARCHIVE la note en l'estampillant de la version ou le correctif part.
Aucun outil de cette famille ne va au-dela de « exporter vers Jira ».

**Et surtout la COMBINAISON** : open source + auto-hebergeable + chiffre de
bout en bout. Un MCP se copie en un week-end ; un SaaS ne peut pas suivre sur
le chiffrement aveugle sans contredire son propre modele.

---

## Autres sujets ouverts

- **Notifications.** Aujourd'hui personne n'est prevenu qu'une note est
  arrivee. Sur le projet d'origine, c'est une tache periodique qui les
  relevait. Un courriel a chaque nouvelle note fermerait la boucle.
- **Vue d'ensemble.** Aucun ecran ne liste les notes ouvertes toutes pages
  confondues. Il faut ouvrir chaque page, ou lire l'export brut.
- **Refus du serveur mal expliques.** Constate en vrai : quand un pare-feu
  d'hebergeur repond 403 avec du HTML, le relecteur lit « Le serveur a repondu
  quelque chose d'inattendu ». Le texte saisi est bien conserve, mais le
  message devrait nommer le refus et suggerer de reformuler.
- **Suppression.** Choix d'origine : aucune note ne s'efface, on n'efface pas
  la remarque de quelqu'un d'autre. A conserver — mais un operateur qui laisse
  un message par erreur n'a aucun recours. Constate, sans solution retenue.
