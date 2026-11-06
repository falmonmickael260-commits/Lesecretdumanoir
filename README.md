# ESCAPE PROJECT — Les Secrets du Manoir

Jeu coopératif 2,5D pour quatre joueurs. Le navigateur affiche une scène 3D en vue trois quarts ; le serveur valide les déplacements, les objets, les mécanismes et le temps.

## Démarrage local

Node.js 24 ou plus récent est requis pour `node:sqlite`.

```bash
npm ci
npm run dev
```

Ouvrir `http://localhost:5198` dans quatre onglets ou appareils. Un joueur crée une salle, transmet le code, puis tous choisissent un personnage et se déclarent prêts. L’hôte lance la partie.

## Production

```bash
npm run build
npm start
```

Le serveur sert le client compilé, `/ws` et les API sur `PORT` (8787 par défaut). Placer `DATA_DIR` sur un volume persistant pour conserver les salles et les résultats SQLite. Mettre un proxy HTTPS devant le serveur pour utiliser WSS en production.

## Commandes

| Plateforme | Déplacement | Course | Interaction |
|---|---|---|---|
| Ordinateur | WASD ou flèches | Maj | E ou clic sur un repère |
| Téléphone | Joystick tactile | Bouton Courir | Bouton Agir, à maintenir pour les mécanismes coopératifs |

L’inventaire contient quatre objets. Un objet peut être déposé ou donné à un coéquipier proche. Les objets déposés restent récupérables et suivent l’équipe vers la pièce suivante.

## Architecture

- `src/Scene.tsx` : scène Three.js, caméra, décors, personnages GLB riggés et animations.
- `src/main.tsx` : lobby, commandes, HUD, inventaire, indices, classement.
- `src/shared.ts` : protocole et définitions des huit pièces.
- `server/engine.ts` : règles des énigmes, collisions, inventaire, coopération et victoire.
- `server/index.ts` : salles WebSocket, sauvegarde SQLite, chronomètre, reconnexion et API.
- `tests/` : parcours logique des huit pièces, objets perdus, test réseau à quatre clients, captures Chrome ordinateur et mobile.

Le serveur mesure le temps et refuse les actions hors de portée ou sans objet requis. Chaque joueur reçoit un jeton de reconnexion aléatoire de 256 bits, stocké uniquement sous forme de hachage dans la base. Une reprise remplace le jeton précédent. Une salle en cours se recharge après un redémarrage sans réinitialiser son chronomètre.

Le classement mondial, hebdomadaire et mensuel conserve le meilleur résultat par nom d’équipe et affiche jusqu’à 100 équipes. L’API `/api/history?team=...` fournit l’historique et le meilleur temps d’une équipe. Les identifiants de joueurs sont actuellement des identifiants anonymes de session ; une authentification commune avec Revanche Games devra les remplacer avant un classement compétitif public.

## Vérification

```bash
npm test
npm run build
npm run test:browser
```

Le test navigateur nécessite Google Chrome et les serveurs de développement lancés. `CHROME_PATH` et `TEST_ORIGIN` permettent de changer leurs chemins ou adresses. Les captures sont écrites dans `artifacts/`.

## État du jeu

Le parcours des huit pièces est jouable et testable. Le hall possède une fouille, une lampe, une armoire poussée à deux, une cachette derrière un tableau, une clé et une porte animée. Les autres pièces ont des interactions différentes et une victoire validée à quatre côté serveur.

Le jeu n’est pas encore équilibré pour une découverte de 25 à 45 minutes. Les décors des pièces 2 à 8, les animations de manipulation, le son et l’intégration aux comptes Revanche Games nécessitent encore du travail de production. Les tests de gestes ont été réalisés dans Chrome avec une taille d’écran mobile ; un essai sur appareils physiques reste nécessaire.
