---
workflow: product-launch-video
flow: automation
storyboard: no
message: "Un score saisi apparaît instantanément sur le site public — zéro latence."
destination: tiktok-reels
aspect: 1080x1920
language: fr
audience: organisateurs de tournois sportifs (clubs, écoles, ligues amateurs)
length: 15s
angle: "Zéro seconde d'attente" — preuve par la démonstration (écran partagé avant/après)
---

## Intent

Promo produit pour TournArena (tournarena.com), réalisé par Kelto Studio
(kelto-studio.fr). Vend un seul bénéfice concret : quand un organisateur
saisit un score, le site public affiché aux joueurs/familles/spectateurs se
met à jour instantanément, sans rafraîchissement. Ton confiant, direct, pas
de voix off — le message porte sur le texte à l'écran et la démonstration
visuelle elle-même.

## Assets

- Aucun asset fourni par l'utilisateur pour l'instant.
- Capturer les pages publiques réelles de tournarena.com (page d'accueil,
  et une page de tournoi de démonstration si disponible sans connexion).
- L'app organisateur (saisie de score) est derrière connexion, non
  capturable : construire un mock stylisé cohérent avec le composant
  `.mock` déjà existant sur kelto-studio.fr (carte "téléphone" sombre,
  scores en direct, badge "En direct" avec point vert) plutôt qu'une vraie
  capture d'écran.
- Logo Kelto Studio (badge arrondi bronze, K en trait épais noir) pour le
  plan de clôture — vecteur disponible dans le dépôt à
  `sites/kelto-studio/brand/kelto-mark.svg` (fond sombre) et
  `kelto-logo-full-dark-bg.svg` (logo + texte, texte clair pour fond
  sombre) — les récupérer comme design reference plutôt que de les
  reconstruire à la main.

## Customizations

- Aucune capacité additionnelle du menu demandée pour ce premier plan —
  rester volontairement simple (texte à l'écran + écran partagé + logo),
  cohérent avec le reste du kit marketing déjà produit pour ce lancement.

## Notes

- Silencieux (pas de voix off, pas de musique définie a priori — laisser le
  workflow proposer un lit musical discret si le preset choisi en prévoit
  un, sinon rester muet).
- Correction importante : ceci est une vidéo pour **TournArena**, le produit
  — sa propre identité de marque "Ink & Signal" (thème sombre), PAS la
  palette bronze/parchemin de Kelto Studio (le studio qui l'a conçu, crédité
  seulement en petit sur le plan de clôture). Même erreur déjà corrigée sur
  l'affiche de lancement (`docs/marketing/launch/`) — la capture de
  tournarena.com le confirme d'ailleurs : la section hero du vrai site a un
  fond `#0B1220`, cohérent avec ce thème sombre.
- Design spec (référence explicite "Ink & Signal" thème sombre, cohérente
  avec la capture) :
  - Fond : `#0b1220` (ink, dark mode)
  - Surface / cartes : `#141b2e`, bordure `#1f2a44`
  - Accent principal (signal) : `#38bdf8` (cyan)
  - Accent secondaire marketing (ember, réservé aux touches chaudes/CTA) :
    `#f5b942`
  - Texte principal sur fond sombre : `#e7ecf5`
  - Texte atténué : `#94a3b8`
  - Police display (titres/texte à l'écran) : "Space Grotesk", avec repli
    système (-apple-system, Segoe UI) — même police que le vrai site
    (détectée dans la capture)
  - Police body : "Inter", repli système
  - Coins arrondis modérés (badges, cartes), pas de style bronze/artisanal —
    esthétique SaaS/tech nette
- Découpage temporel demandé (le workflow peut affiner le rythme, mais le
  message et l'ordre des beats sont fixés) :
  1. 0–2s — texte à l'écran : « 0 seconde d'attente. »
  2. 2–8s — écran partagé : à gauche un score saisi côté organisateur
     (mock), à droite le site public déjà à jour avec ce score
  3. 8–12s — texte de confirmation du message
  4. 12–15s — logo Kelto Studio + « tournarena.com »
- Légende prévue pour la publication (hors vidéo, juste pour info) : « Un
  score saisi = tout le monde le voit, instantanément. ⚡ TournArena, par
  Kelto Studio. » — hashtags `#LiveScore #TournArena #SportsApp
  #KeltoStudio`.
