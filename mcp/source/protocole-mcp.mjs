/* protocole-mcp.mjs — LE PROTOCOLE, A LA MAIN, SUR L'ENTREE ET LA SORTIE
 * STANDARD.
 *
 * POURQUOI SANS BIBLIOTHEQUE. C'est une decision, pas une paresse, et elle a
 * un prix qu'il faut ecrire :
 *
 *  - ce paquet detient LE SEL. Une dependance, c'est du code tiers qui
 *    s'execute dans le meme processus que le seul secret du projet, et qui se
 *    met a jour tout seul dans l'arbre des dependances de quelqu'un d'autre.
 *    La decision de securite qui gouverne ce projet dit que le vrai risque de
 *    cette architecture est la chaine d'approvisionnement ; on ne va pas
 *    l'ecrire pour le client servi en CDN et l'oublier pour le paquet qui a
 *    la cle ;
 *  - « npm install @annotepage/mcp » ne tire donc RIEN. Zero dependance, zero
 *    transitive, zero etape de construction. C'est l'outil d'origine qui
 *    parle : « aucune dependance a installer, rien a compiler » ;
 *  - LE PRIX, franchement : quand le protocole evolue, c'est nous qui suivons.
 *    Ce fichier implante la couche de transport et les cinq methodes dont un
 *    serveur d'outils a besoin, et rien d'autre — pas de ressources, pas
 *    d'invites, pas d'echantillonnage. Le jour ou il en faut, c'est ici qu'on
 *    les ajoute, a la main.
 *
 * LE TRANSPORT : des messages JSON-RPC 2.0, un par ligne, sur stdin et
 * stdout.
 *
 * REGLE ABSOLUE DE CE FICHIER : rien d'autre que du JSON-RPC ne sort sur
 * stdout. Un « console.log » de mise au point casse la conversation au milieu
 * d'un message et l'assistant en face n'a aucun moyen de le comprendre. Tout
 * ce qu'on veut dire a un humain sort sur stderr.
 */

import { createInterface } from 'node:readline';

/* Les versions du protocole que ce serveur sait tenir, la plus recente en
   tete. On repond au client avec LA SIENNE quand on la connait : c'est ce que
   la negociation demande, et repondre systematiquement la notre ferait tomber
   un client plus ancien sans lui dire pourquoi. */
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const CODES = {
    analyse: -32700,
    requete: -32600,
    methode: -32601,
    parametres: -32602,
    interne: -32603,
};

export const journal = (...morceaux) => {
    process.stderr.write('[annotepage-mcp] ' + morceaux.join(' ') + '\n');
};

/**
 * Demarre la boucle.
 *
 * @param {object} identite  { name, version }
 * @param {Array}  outils    [{ nom, titre, description, schema, appeler }]
 */
export const servir = (identite, outils) => {
    const sortir = (message) => {
        process.stdout.write(JSON.stringify(message) + '\n');
    };

    const repondre = (id, resultat) => {
        if (id === undefined || id === null) return;   // c'etait une notification
        sortir({ jsonrpc: '2.0', id, result: resultat });
    };

    const echouer = (id, code, message) => {
        if (id === undefined || id === null) return;
        sortir({ jsonrpc: '2.0', id, error: { code, message } });
    };

    const declaration = (outil) => ({
        name: outil.nom,
        title: outil.titre,
        description: outil.description,
        inputSchema: outil.schema,
    });

    const appeler = async (id, parametres) => {
        const nom = parametres && parametres.name;
        const outil = outils.find((o) => o.nom === nom);
        if (!outil) {
            echouer(id, CODES.parametres,
                'Outil inconnu : ' + String(nom) + '. Outils disponibles : '
                + outils.map((o) => o.nom).join(', '));
            return;
        }
        try {
            const texte = await outil.appeler(
                (parametres && parametres.arguments) || {});
            repondre(id, { content: [{ type: 'text', text: texte }] });
        } catch (e) {
            /* UNE PANNE D'OUTIL N'EST PAS UNE PANNE DE PROTOCOLE. On rend un
               resultat marque « isError », et non une erreur JSON-RPC : le
               message est redige pour etre lu par l'assistant, qui doit
               pouvoir le corriger et recommencer. Une erreur de protocole,
               elle, arrete la conversation.

               Le message du serveur PHP arrive ici tel qu'il l'a redige. Le
               remplacer par « erreur 400 » jetterait la seule information
               utile — c'est deja la regle du client. */
            repondre(id, {
                content: [{ type: 'text', text: (e && e.message) || String(e) }],
                isError: true,
            });
        }
    };

    const traiter = async (message) => {
        if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
            echouer(message && message.id, CODES.requete,
                'Message JSON-RPC 2.0 attendu.');
            return;
        }

        const { id, method, params } = message;

        switch (method) {
            case 'initialize': {
                const demandee = params && params.protocolVersion;
                repondre(id, {
                    protocolVersion: VERSIONS.includes(demandee) ? demandee : VERSIONS[0],
                    capabilities: { tools: { listChanged: false } },
                    serverInfo: identite,
                });
                return;
            }
            case 'notifications/initialized':
            case 'notifications/cancelled':
                return;                      // notifications : rien a repondre
            case 'ping':
                repondre(id, {});
                return;
            case 'tools/list':
                repondre(id, { tools: outils.map(declaration) });
                return;
            case 'tools/call':
                await appeler(id, params);
                return;
            default:
                if (method.startsWith('notifications/')) return;
                echouer(id, CODES.methode, 'Methode non implantee : ' + method);
        }
    };

    const lecteur = createInterface({ input: process.stdin });

    /* Les messages sont traites A LA SUITE, jamais en parallele. Deux
       ecritures simultanees sur le meme projet produiraient deux notes la ou
       l'assistant en voulait une, et rien ne s'efface dans cet outil. La
       lenteur ainsi payee est celle du reseau, sur un outil qu'un humain
       attend de toute facon. */
    let file = Promise.resolve();

    lecteur.on('line', (ligne) => {
        const brut = ligne.trim();
        if (brut === '') return;
        let message;
        try {
            message = JSON.parse(brut);
        } catch (e) {
            sortir({ jsonrpc: '2.0', id: null,
                     error: { code: CODES.analyse, message: 'JSON invalide.' } });
            return;
        }
        file = file.then(() => traiter(message)).catch((e) => {
            journal('panne interne :', (e && e.stack) || String(e));
            echouer(message.id, CODES.interne, (e && e.message) || String(e));
        });
    });

    lecteur.on('close', () => {
        /* L'assistant a ferme le tuyau : il n'y a plus personne a qui parler.
           On sort quand la file est vide, JAMAIS tout de suite — une requete
           d'ecriture en vol serait abandonnee au milieu, et l'appelant ne
           saurait pas si la note a ete enregistree. C'est exactement le doute
           qu'on refuse partout ailleurs dans cet outil. */
        file.then(() => process.exit(0), () => process.exit(1));
    });
};
