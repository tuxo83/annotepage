# @annotepage/client

La couche d'annotation d'annotepage, côté navigateur : on clique sur un élément
d'une page, on y laisse une remarque, elle part **chiffrée par le navigateur**.
Une IA lit ces remarques, corrige, répond dans le fil et archive la note en
estampillant la version où le correctif part.

Un seul fichier, aucune dépendance, aucun cadriciel. Il se charge par une
balise `<script>` sous empreinte SRI.

**La documentation est dans `LISEZMOI.md`**, à côté de ce fichier dans le
paquet : extrait d'installation complet, attributs de la balise, modes clair et
chiffré, ce que le serveur voit et ce qu'il ne voit pas, CSP, construction et
publication. Le format d'échange et le modèle de sécurité sont dans `FORMAT.md`,
à la racine du dépôt.

Ce fichier-ci ne répète ni l'empreinte SRI ni les commandes : une empreinte
recopiée à deux endroits finit fausse à l'un des deux.

Licence MIT.
