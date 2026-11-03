# Visuels des fiches store (Google Play + App Store Connect)

À uploader manuellement dans les deux consoles (aucune des deux n'expose
d'`<input type="file">` accessible à l'automatisation — le champ n'existe qu'après clic, ce
qui ouvre le sélecteur natif de l'OS).

## Contenu

- `play/icon-512.png` — icône 512×512, dérivée par redimensionnement simple de
  `apps/mobile/resources/icon.png` (source de vérité, voir `docs/design/logo.md`).
- `play/feature-graphic-1024x500.png` — image de présentation Play Store, rendue via
  Playwright à partir de la géométrie exacte de `libs/design-system/src/lib/logo/`
  (variante `on-dark`, fond `#1e293b`).
- `play/screenshots/*.png` (1080×2400), `app-store/screenshots-6.5in/*.png` (1242×2688),
  `app-store/screenshots-ipad-13in/*.png` (2064×2752) — les mêmes 4 captures (découverte/
  recherche de tournoi, fiche tournoi, phase finale, calendrier) à chaque taille exigée.

  **Régénérées le 2026-08-29** via `node infra/scripts/capture-store-screenshots.mjs
  <slug-du-tournoi>` (nécessite `npm run dev:api` + `npm run dev:mobile` déjà lancés, et le
  tournoi vitrine seedé/mis à jour localement — voir l'en-tête de
  `apps/api/prisma/seed-world-cup-2026.ts`) plutôt que capturées à la main sur l'émulateur
  Android comme la toute première version (2026-08-19) : cette 1ère version montrait la
  barre de statut Android sur les captures App Store (refusé par Apple, guideline 2.3.10 —
  "remove non-iOS status bar images") et le nom/logo FIFA du tournoi vitrine d'alors
  (refusé, guideline 5.2.1, voir le rebrand du 2026-08-28 vers "Coupe des Nations
  TournArena 2026"). Le nouveau script capture directement un viewport Playwright nu, sans
  aucun habillage d'OS (ni barre Android, ni fausse barre iOS) — Apple demandait de
  *retirer* la barre non-iOS, pas d'en simuler une iOS, et une capture sans aucune barre de
  statut satisfait ça directement sans avoir besoin d'un vrai Simulateur iOS (pas de Mac
  local, cf. ADR 0008).

## Textes associés (déjà saisis dans les deux consoles au 2026-08-19)

Nom, description courte/longue (FR), catégorie (Sports), contact (`contact@tournarena.com`,
`https://tournarena.com`), sous-titre/mots-clés/URLs App Store — voir l'historique de
conversation pour le texte exact FR. **Traduction EN encore à faire.**

## Reste à faire (porteur de projet)

- Uploader les captures d'écran régénérées (12 fichiers : 4 par taille × 3 tailles) dans
  les deux consoles (glisser-déposer, ~2 min) — remplace les anciennes captures refusées
  par Apple.
- Traduire la fiche en anglais (Google Play : ajouter une langue ; App Store Connect :
  ajouter une localisation en-US).
- Google Play : Data safety, classification du contenu, cible (déclarée adultes
  uniquement), annonces (aucune), fonctionnalités financières (paiements Stripe hors Play
  Billing — à vérifier ensemble avant de cocher).
- App Store Connect : App Privacy, classification par âge, accepter le contrat Apple
  Developer Program mis à jour, statut de commerçant (obligatoire UE/DSA).
