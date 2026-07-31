# Socle mobile

Implémente `apps/mobile` (Ionic Angular + Capacitor) prévu depuis l'audit
initial (`docs/architecture/architecture-overview.md`), dans
`feat/017-mobile-foundation`. Portée : les mêmes capacités de suivi public
que `public-web` (tournoi par identifiant, calendrier, classements de poule,
recherche et fiche équipe), avec mise à jour en temps réel — pas
d'authentification, pas de favoris (`feat/018`), pas de notifications push
(`feat/019`), pas de mode hors ligne (`feat/020`), conformément à
`docs/product/product-vision.md`.

## Câblage Ionic à la main, pas via l'Ionic CLI

Ce monorepo est un simple workspace Angular CLI (pas Nx), avec un unique
`package.json` racine et un `tsconfig.json` partagé référençant chaque
app/lib. `ionic start`/l'Ionic CLI scaffolderait son propre workspace
(propre `angular.json`, propre gestion de dépendances), incompatible avec
cette convention. À la place : `ng generate application mobile` (schéma
Angular standard, atterrit dans `apps/mobile` comme les autres apps), puis
ajout manuel de `@ionic/angular`/`@capacitor/core` et de
`provideIonicAngular()` dans `app.config.ts` — l'app reste une application
Angular CLI standard du point de vue du workspace, juste avec des
composants `Ion*` standalone (`@ionic/angular/standalone`) et un shell
Capacitor par-dessus.

## Trois nouvelles libs partagées (web + mobile)

- **`libs/shared-models`** : les interfaces publiques de tournoi (`Match`,
  `PublicTournament`, `Standings`, etc.), déplacées telles quelles depuis
  `apps/public-web/src/app/core/models.ts`. `admin-web` réexporte les 13
  interfaces qu'il partageait déjà à l'identique avec public-web
  (`export * from 'shared-models'` en tête de son propre `models.ts`) sans
  toucher ses ~10 services consommateurs — ses types propres au domaine
  admin (structure de phase avec durées de match, équipe avec manager,
  etc.) restent locaux.
- **`libs/api-client`** : `PublicApiService` (les 10 endpoints publics en
  lecture seule), avec l'URL de base injectée via `API_CLIENT_CONFIG`/
  `provideApiClient()` au lieu d'un import direct d'`environment` — `mobile`
  et `public-web` fournissent chacun leur propre URL. `public-web` a été
  migré vers cette lib dans la même PR pour éviter une double implémentation.
- **`libs/realtime-client`** : `TournamentEventStream`, extraction du
  wrapper `EventSource` (debounce 300 ms, signal, cleanup) déjà en place
  dans `public-web`'s `TournamentContextService` (`feat/016`). `public-web`
  a aussi été refactoré pour construire sur cette classe plutôt que de
  garder sa propre copie ; `mobile` compose sa propre
  `TournamentContextService` (app-locale, pas extraite) à partir de
  `PublicApiService` + `TournamentEventStream` + `shared-models`.

`libs/design-tokens` (déjà framework-agnostique — CSS custom properties +
un `ThemeService` minimal) est réutilisée telle quelle par `mobile`, sans
modification. `libs/design-system` (Material/web) n'est **pas** partagée
avec le mobile, conformément à la mission (§27 : « ne force pas le partage
des composants lorsque les usages web et mobile diffèrent ») — les écrans
mobile utilisent les composants Ionic natifs.

## Portée volontairement réduite du Classement mobile

L'écran Classements mobile affiche les classements de poule et les badges
de qualification, mais **pas** le tableau à élimination directe ni le
podium final (`apps/public-web/src/app/pages/standings/standings.page.ts`
et `final-ranking.util.ts`) — le portage d'une visualisation d'arbre de
bracket vers les composants Ionic est un vrai travail d'UI, hors scope
d'un socle. Coupe assumée, pas un oubli ; à traiter dans une PR mobile
ultérieure si besoin.

## Décision : Android uniquement dans cette PR, iOS différé

Poste de développement Windows, sans Mac/Xcode disponible — impossible de
`cap add ios`/builder/vérifier une plateforme iOS ici. Seule la plateforme
Capacitor Android est ajoutée (`npx cap add android` depuis `apps/mobile`),
avec un build Gradle debug réel exécuté localement (SDK Android + JDK 21
Adoptium déjà présents sur ce poste) : `assembleDebug` produit
`android/app/build/outputs/apk/debug/app-debug.apk`, code de sortie 0.
L'ajout de la plateforme iOS est explicitement reporté à un moment où un
Mac ou un runner CI macOS sera disponible.

Comme pour `dist/`, les dossiers `android/`/`ios/` sont dans `.gitignore`
depuis `feat/003-project-foundation` — traités comme des artefacts
régénérables (`npx cap add android`), pas committés.

## Point de vigilance : Vitest + `@ionic/core`

`@ionic/core` n'a pas de champ `"exports"` dans son `package.json`. Quand
Vitest traite le paquet comme externe (comportement par défaut), le
résolveur ESM natif de Node échoue sur l'import bare
`@ionic/core/components` utilisé par le bundle `@ionic/angular`. Fix :
`apps/mobile/vitest.config.ts` force l'inlining de `@ionic/core`/
`@ionic/angular` (`ssr.noExternal` + `test.server.deps.inline`), ce qui
fait passer la résolution par le résolveur (plus permissif) de Vite plutôt
que par celui de Node. Un simple `resolve.alias` seul ne suffit pas et
casse même d'autres imports (Vite fait du prefix-matching sur les alias en
chaîne) — voir le commentaire dans ce fichier.

Ce repo tourne déjà sans `zone.js` (zoneless par défaut sous Angular 22).
`@ionic/angular` déclare `zone.js` comme peer dependency non-optionnelle,
mais aucune app n'importe `zone.js` nulle part (vérifié) — `npm install`
l'ajoute à `node_modules` pour satisfaire le peer, sans effet puisqu'il
n'est jamais chargé. Point vérifié en pratique lors du test manuel Chrome
(rafraîchissement temps réel + interactions `ion-select`/`ion-searchbar`
fonctionnent sans zone.js).

## Ce que cette PR ne couvre pas

- iOS (voir ci-dessus).
- CI : seule la couche web/Ionic est vérifiée en CI (lint/build/test), pas
  de build Android natif automatisé — pas d'infra macOS/Android CI pour
  l'instant, cohérent avec le choix de vérification locale plutôt que CI
  pour Android dans cette PR. À revoir si un besoin de CI natif émerge.
- Favoris, notifications push, mode hors ligne : PR mobile séparées déjà
  prévues (`feat/018`, `feat/019`, `feat/020`).
