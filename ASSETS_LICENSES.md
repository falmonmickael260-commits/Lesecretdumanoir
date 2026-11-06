# Provenance des modèles 3D

Les quatre avatars dans `public/models/` proviennent du pack [Universal Base Characters de Quaternius](https://quaternius.com/packs/universalbasecharacters.html), publié sous licence [CC0](https://creativecommons.org/publicdomain/zero/1.0/). Ils ont été copiés depuis le projet local `code/quivatomber`, qui documente la même provenance dans son fichier `ASSETS_LICENSES.md`.

Fichiers utilisés : `h-adventurer.glb`, `f-adventurer.glb`, `h-suit.glb`, `f-formal.glb`. Les modèles contiennent leur squelette et leurs animations de base. Les mouvements de marche, course et poussée sont ajoutés par le code du jeu.

La musique et les effets actuels sont synthétisés par `src/audio.ts` ; aucun fichier audio tiers n’est inclus. Les autres décors sont créés en code dans `src/Scene.tsx`. Les polices Cormorant Garamond et DM Sans sont chargées depuis Google Fonts sous Open Font License.
