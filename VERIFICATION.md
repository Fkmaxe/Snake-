# Vérification du 10 novembre 2026

- Vérification de syntaxe et des imports des 21 modules et scripts : réussie.
- 22 tests automatisés de logique : réussis.
- Parcours d’intégration dans Chrome sur macOS : réussi en HTTP et avec le fichier autonome `SERPENT.html` ouvert en `file://`.
- Rendu WebGL 2, compilation GLSL, framebuffers HDR et absence d’erreurs GL : vérifiés.
- Démarrage du contexte audio après une interaction : vérifié.
- Départ, compte à rebours, collecte, HUD, directions clavier et boost maintenu : vérifiés.
- Pause avec horloge figée, reprise, changements de caméra et virages relatifs en poursuite : vérifiés.
- Réglages du volume et de qualité à chaud, dialogue modal et persistance après rechargement : vérifiés.
- Collision, écran de résultat, record, redémarrage et remise à zéro : vérifiés.
- Apparition des avertissements du mode Survie : vérifiée.
- Mise en page à 1440 × 1000 et à 390 × 844, absence de débordement horizontal, contrôles tactiles : vérifiés.
- Perte puis restauration volontaire du contexte WebGL, puis destruction explicite de l’application : vérifiées.
- Aucun téléchargement d’asset externe, aucune erreur de console et aucune requête en échec pendant le parcours.

Le compteur a indiqué 60 à 120 FPS sur la machine de vérification. Il ne s’agit pas d’une garantie universelle ni d’un benchmark de tous les GPU. Le support matériel des manettes et les autres navigateurs n’ont pas été testés physiquement pendant cette session.

Les captures et le rapport JSON produits lors des tests sont conservés dans le dossier local `artifacts/`. Les tests sont reproductibles avec les commandes du README.
