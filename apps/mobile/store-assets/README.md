# Visuels des fiches store (Google Play + App Store Connect)

Générés le 2026-08-19, à uploader manuellement dans les deux consoles (aucune des deux
n'expose d'`<input type="file">` accessible à l'automatisation — le champ n'existe qu'après
clic, ce qui ouvre le sélecteur natif de l'OS).

## Contenu

- `play/icon-512.png` — icône 512×512, dérivée par redimensionnement simple de
  `apps/mobile/resources/icon.png` (source de vérité, voir `docs/design/logo.md`).
- `play/feature-graphic-1024x500.png` — image de présentation Play Store, rendue via
  Playwright à partir de la géométrie exacte de `libs/design-system/src/lib/logo/`
  (variante `on-dark`, fond `#1e293b`).
- `play/screenshots/*.png` — 4 captures d'écran téléphone (1080×2400, natif), prises sur
  l'émulateur Android (`npm run emulator:mobile`) avec les données World Cup 2026 déjà
  seedées : découverte/recherche de tournoi, fiche tournoi, phase finale (tableau à
  élimination), calendrier.
- `app-store/screenshots-6.5in/*.png` — mêmes captures, recadrées (`fit: cover`, crop
  minimal) à 1242×2688 pour respecter la taille exacte exigée par App Store Connect pour
  l'iPhone 6,5". Pas de simulateur iOS utilisé (aucun Mac local, cf. ADR 0008) — l'UI
  Capacitor étant partagée entre les deux plateformes, les captures Android recadrées sont
  représentatives.

## Textes associés (déjà saisis dans les deux consoles au 2026-08-19)

Nom, description courte/longue (FR), catégorie (Sports), contact (`contact@tournarena.com`,
`https://tournarena.com`), sous-titre/mots-clés/URLs App Store — voir l'historique de
conversation pour le texte exact FR. **Traduction EN encore à faire.**

## Reste à faire (porteur de projet)

- Uploader ces 10 fichiers dans les deux consoles (glisser-déposer, ~2 min).
- Traduire la fiche en anglais (Google Play : ajouter une langue ; App Store Connect :
  ajouter une localisation en-US).
- Google Play : Data safety, classification du contenu, cible (déclarée adultes
  uniquement), annonces (aucune), fonctionnalités financières (paiements Stripe hors Play
  Billing — à vérifier ensemble avant de cocher).
- App Store Connect : App Privacy, classification par âge, accepter le contrat Apple
  Developer Program mis à jour, statut de commerçant (obligatoire UE/DSA).
