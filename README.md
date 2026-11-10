# SERPENT — Neon Protocol

Un Snake complet en français : arène 3D procédurale, trois protocoles de jeu, trois caméras et bande-son synthétisée. **Aucune dépendance, aucun CDN, aucun fichier image, aucune piste audio.** Le jeu fonctionne sans connexion Internet dès qu’il est servi localement.

## Jouer

**Le plus direct : ouvrir `SERPENT.html` dans votre navigateur.** Ce fichier autonome contient l’intégralité du jeu, des styles, des shaders et de l’audio procédural. Aucun serveur ni installation n’est nécessaire.

Pour travailler sur les sources modulaires, avec rechargement manuel après modification :

Avec Node.js 20 ou plus récent :

```sh
cd serpent
npm start
```

Ouvrir **http://localhost:4173**. Il n’y a rien à installer ni à compiler. `PORT=8080 npm start` change le port. Le dossier `dist/` peut aussi être servi par n’importe quel serveur HTTP statique, à la racine ou dans un sous-dossier. Les modules de `dist/` nécessitent HTTP ; pour une ouverture directe en `file://`, utiliser `SERPENT.html` à la racine.

Après modification des modules, `npm run build` régénère ce fichier autonome. Le bundler est fourni, sans dépendance et sans minification ; les sources restent lisibles.

Le navigateur doit prendre en charge **WebGL 2**. Chrome, Edge, Firefox et Safari récents conviennent ; la validation automatisée de cette version a été réalisée dans Chrome sur macOS. Web Audio démarre après une interaction, conformément aux règles du navigateur. Le framerate dépend du GPU, de la résolution et de l’appareil ; le réglage **Équilibrée** réduit la résolution, le bloom et supprime la profondeur de champ.

## Protocoles

| Mode | Règles |
| --- | --- |
| **Néon** | Murs mortels, serpent qui grandit et accélère à chaque noyau. |
| **Flux** | Bords connectés, portails par paires tous les trois noyaux, surcharge temporelle de six secondes toutes les dix-huit secondes. Points ×1,5. |
| **Survie** | Trois nouveaux obstacles toutes les neuf secondes, annoncés pendant 2,4 secondes. Un obstacle attend si le serpent occupe sa case. Points ×2. |

Chaque noyau vaut 100 points avant multiplicateurs. Une collecte dans les six secondes prolonge un combo jusqu’à ×5. Le boost double les points et consomme une réserve rechargeable ; un noyau restitue aussi de l’énergie. Les records sont séparés par protocole et conservés dans le stockage local. Remplir toutes les cases disponibles termine la partie par une victoire.

## Commandes

| Action | Commande |
| --- | --- |
| Déplacement en ISO / 2D | Flèches, ZQSD ou WASD |
| Virages en poursuite 3D | Gauche / droite, par rapport au serpent |
| Boost | Maintenir Espace ou Maj |
| Caméra | C, ou boutons ISO / 2D / 3D |
| Pause / reprise | Échap ou P |
| Son | M |
| Démarrer | Entrée, ou bouton de lancement |
| Rejouer après collision | R, ou bouton Rejouer |
| Mobile | Glisser sur l’arène ou utiliser le pavé directionnel ; maintenir BOOST |
| Manette | Stick / croix, A pour le boost, Y pour la caméra, Start pour la pause |

La caméra poursuite possède une mini-carte. Les changements de caméra conservent la partie. Pour changer de protocole, revenir à la sélection depuis Pause ou la fin de partie. L’ouverture des réglages, la perte de focus et le passage en arrière-plan suspendent automatiquement la simulation.

## Pipeline graphique

1. Géométries de cubes biseautés et de tores générées par fonctions, envoyées par rendu instancié.
2. Carte d’ombres directionnelles de 1024², filtrage PCF à neuf échantillons.
3. Scène en framebuffer HDR `RGBA16F` si `EXT_color_buffer_float` est disponible ; repli automatique en `RGBA8`.
4. Sol procédural : grille anticrénelée par dérivées GLSL, circuits, halos, ondes et éclairage des noyaux et de la tête.
5. Particules physiques dans un pool de capacité fixe, étoiles procédurales et blending additif.
6. Extraction de luminance puis bloom gaussien séparable à demi-résolution.
7. Profondeur de champ à partir de la texture de profondeur, flou radial pendant le boost, aberration chromatique brève à l’impact, exposition, grain et vignette.

La profondeur de champ est désactivée en vue tactique afin de préserver la précision. Les projections lumineuses sous les segments sont stylisées ; il ne s’agit pas de réflexions SSR. L’option Mouvements réduits supprime les secousses, le mouvement d’ambiance et le flou du boost. La préférence système est prise en compte au premier lancement.

## Architecture

| Sous-système | Responsabilité |
| --- | --- |
| `config.js` | Configuration centrale profondément gelée : règles, horloges, caméra, rendu et audio. |
| `GameStateManager` | Transitions explicites Boot → Menu → Playing, Paused et GameOver ; transitions illégales rejetées. |
| `SnakeLogic` | Corps, direction, file d’entrées, déplacement, croissance et collisions. |
| `GameSession` | Scores, combos, nourriture, boost, portails, obstacles et mutateurs. |
| `PhysicsEngine` | Accumulateur à 120 Hz, rattrapage borné, correction des arrondis. |
| `RenderPipeline` | WebGL 2, ombres, buffers, géométries, shaders, caméras et composition. |
| `ParticleSystem` | Pool de particules, intégration physique et tampon de sommets réutilisé. |
| `InputEngine` | Clavier, pointeur, tactile et manette ; nettoyage des commandes retenues. |
| `AudioSynthesizer` | Oscillateurs, enveloppes, bruit, arpégiateur, délai et compression. |
| `UserInterface` | HUD, dialogues accessibles, mini-carte et réglages. |
| `Storage` / `EventBus` | Persistance tolérante aux erreurs et événements découplant les systèmes. |

La simulation avance à un pas fixe de 1/120 seconde. La progression du serpent est discrète ; le rendu interpole les segments entre les cases. Les passages de bord et de portail sont détectés pour éviter une interpolation à travers toute l’arène. Le moteur préserve deux virages successifs, refuse les demi-tours et autorise une case de queue qui se libère.

Les états ne font pas avancer le jeu lorsqu’il est en pause. `dispose()` annule `requestAnimationFrame`, retire les abonnements et listeners via `AbortController`, déconnecte l’observateur de taille, détruit les VAO / buffers / textures / framebuffers / programmes, libère le contexte WebGL, arrête le séquenceur et ferme le contexte audio. Les framebuffers précédents sont détruits au redimensionnement. Une perte de contexte suspend la partie ; une restauration recrée le pipeline avant une reprise volontaire.

## Vérification

```sh
npm run check
npm test
```

**22 tests** couvrent notamment les transitions, les collisions avec la queue, la croissance, le boost, les combos, les portails, les obstacles différés, la victoire, la persistance et l’équivalence à 30/60/144 FPS.

Le test navigateur n’a pas de dépendance. Démarrer le serveur, puis Chrome avec `--headless=new --remote-debugging-port=9222 --user-data-dir=/tmp/serpent-qa`, et exécuter :

```sh
node scripts/browser-qa.mjs
```

`SERPENT_CDP` et `SERPENT_URL` permettent de modifier les adresses. Le test vérifie le rendu et les erreurs WebGL, une collecte réelle, le clavier, le boost, pause/reprise, les caméras, les dialogues, le stockage, la mort et le redémarrage, les obstacles, le tactile à 390 px, la restauration de contexte et la libération des ressources. Captures et rapport sont écrits dans `artifacts/`. Ce test efface le stockage local de son profil de navigateur isolé.

## Arborescence

```text
serpent/
├── SERPENT.html
├── dist/
│   ├── index.html
│   ├── style.css
│   └── src/
│       ├── config.js
│       ├── main.js
│       ├── core/
│       ├── game/
│       ├── render/
│       ├── audio/
│       ├── input/
│       └── ui/
├── scripts/
│   ├── serve.mjs
│   ├── check.mjs
│   ├── build-standalone.mjs
│   └── browser-qa.mjs
├── tests/game.test.mjs
└── package.json
```

Les fichiers de `dist/` sont directement les sources lisibles et exécutables : aucune version compilée divergente à maintenir.
