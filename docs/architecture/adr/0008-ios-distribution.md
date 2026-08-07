# ADR 0008 — Distribution iOS : correctifs mobile + CI GitHub Actions vers TestFlight

## Statut

Accepté pour la partie code (correctifs + workflow CI) — implémentée hors branche `feat/0NN-*`
dédiée pour l'instant, à committer sur une branche avant fusion. **Le compte Apple Developer
Program n'est pas encore créé** : le workflow `deploy-ios.yml` ne peut pas tourner tant que les
secrets qu'il attend n'existent pas — voir "Reste à faire (porteur de projet)" ci-dessous.

## Contexte

Le web est en production (VPS Hostinger, `docs/architecture/adr/0004-deployment-strategy.md`).
`apps/mobile` (Ionic/Capacitor sur Angular) n'avait que la plateforme Android ajoutée
(`apps/mobile/android/`, jamais commité — gitignored comme `ios/`, régénéré via `npx cap add`).
Compiler/signer pour iOS exige Xcode, donc macOS ; décision du porteur de projet : pas de Mac
local, pas de service tiers (Codemagic etc.) — un runner **GitHub Actions `macos-latest`**, dans
le même esprit que `deploy-prod.yml` (déclenchement manuel, `workflow_dispatch`).

Deux bugs empêchaient de toute façon l'app de fonctionner une fois buildée, trouvés en préparant
cette PR :

1. **`apps/mobile/src/environments/environment.ts`** (le fichier réellement utilisé en build de
   production — `angular.json` n'a pas de `fileReplacement` pour la configuration `production`,
   exactement le même trou que l'ADR 0004 avait trouvé et corrigé côté `apps/web`) était codé en
   dur sur `http://localhost:3000/api/v1`. La correction web (URL relative, parce que nginx sert
   web+API sur la même origine) ne s'applique pas ici : une app Capacitor tourne sur sa propre
   origine (`capacitor://localhost` sur iOS, `https://localhost` sur Android), jamais sur le
   domaine de production — il faut une URL absolue.
2. **Les cookies de refresh token (`auth.controller.ts`, `player-auth.controller.ts`) étaient en
   `sameSite: 'lax'`.** En cross-origin (app native → domaine de l'API), `lax` ne renvoie pas le
   cookie sur un appel fetch/XHR — l'app mobile n'aurait jamais pu rester connectée au-delà du
   premier login.

## Décision

1. **`environment.ts`** pointe maintenant sur `https://tournarena.com/api/v1` (absolu, doit
   suivre `DOMAIN`/`WEB_PUBLIC_ORIGIN` de `infra/deployment/.env` si le domaine change).
2. **`sameSite`** devient conditionnel : `'none'` en production (nécessite `secure: true`, déjà le
   cas), `'lax'` sinon (le dev local n'a pas HTTPS, `'none'` y ferait juste rejeter le cookie).
3. **`infra/deployment/docker-compose.prod.yml`** : `CORS_ORIGIN` inclut maintenant, en plus de
   `WEB_PUBLIC_ORIGIN`, `capacitor://localhost` et `https://localhost` — fixes par Capacitor
   lui-même, pas spécifiques au déploiement, donc codés en dur plutôt que sourcés depuis `.env`.
4. **`@capacitor/ios`** ajouté aux devDependencies racine (même version majeure que
   `@capacitor/android`/`@capacitor/core`).
5. **`.github/workflows/deploy-ios.yml`** (`workflow_dispatch`, `runs-on: macos-latest`) :
   build Angular → `npx cap add ios && npx cap sync ios` (le dossier `ios/` n'est jamais commité,
   régénéré à chaque run comme `android/` en local) → import du certificat de distribution et du
   profil de provisioning depuis des secrets GitHub dans un trousseau éphémère → `xcodebuild
   archive` (signature manuelle) → `xcodebuild -exportArchive` avec `destination: upload`
   (Xcode 13+) authentifié par une clé API App Store Connect, qui envoie directement le build sur
   TestFlight — pas de dépendance Fastlane/altool.

## Reste à faire (porteur de projet — pas automatisable)

1. **S'inscrire à l'Apple Developer Program** (99 $/an, developer.apple.com) — individuel ou
   organisation ; la vérification peut prendre 24-48h.
2. Dans **Certificates, Identifiers & Profiles** :
   - App ID avec Bundle ID **`com.arenapulse.mobile`** (doit correspondre exactement à
     `capacitor.config.ts`).
   - Certificat de distribution ("Apple Distribution") — génère une CSR (Keychain Access sur un
     Mac), exporter en `.p12` avec mot de passe.
   - Profil de provisioning **App Store** liant cet App ID et ce certificat.
3. Dans **App Store Connect** :
   - Créer l'app (même Bundle ID, nom "TournArena").
   - Users and Access → Integrations → App Store Connect API → créer une clé (rôle "App Manager"
     suffit pour TestFlight), noter Key ID + Issuer ID, télécharger le `.p8` (une seule fois).
4. Récupérer le **Team ID** (developer.apple.com → Membership).
5. Encoder en base64 (`base64 -i fichier`) et ajouter en secrets GitHub du repo — liste exacte en
   en-tête de `deploy-ios.yml`.
6. Lancer manuellement le workflow (onglet Actions → "Deploy iOS to TestFlight" → Run workflow).
7. Une fois le build visible dans App Store Connect/TestFlight : ajouter des testeurs internes,
   et remplir le questionnaire **App Privacy** (obligatoire même pour TestFlight externe) — doit
   refléter les comptes joueurs et les paiements Stripe (`docs/architecture/adr/0005-player-registration-and-payments.md`).
8. Avant toute release publique (au-delà de TestFlight) : captures d'écran par taille d'appareil,
   description, catégorie, URL de politique de confidentialité, classification d'âge.

## Justification

- `xcodebuild -exportArchive -exportOptionsPlist ... destination: upload` (Xcode 13+) est le
  chemin officiel Apple pour publier depuis la CLI sans outil tiers — cohérent avec l'approche
  "briques génériques, pas de dépendance externe superflue" déjà posée en ADR 0004.
- Un trousseau CI éphémère (créé et supprimé dans le job) plutôt que le trousseau par défaut du
  runner : n'affecte aucun autre job, disparaît de toute façon avec la VM.

## Conséquences

- Icônes et splash screen sont encore les placeholders par défaut de Capacitor (jamais
  personnalisés, ni pour Android ni maintenant iOS) — à remplacer avant une release publique
  réelle, via `@capacitor/assets` par exemple. Hors périmètre ici.
- Le workflow échouera tant que les secrets de la section précédente ne sont pas renseignés —
  attendu, documenté en en-tête du fichier plutôt que découvert au premier run.
- `apps/mobile` n'a toujours pas de configuration Android équivalente en CI (build/signature
  Play Store) — hors périmètre de cette PR, question Android non traitée ici.

## Réversibilité

Le workflow est indépendant de tout service tiers de build mobile (pas de compte Codemagic/Bitrise
à défaire) — remplacer la signature manuelle par `fastlane match`, ou le déclenchement manuel par
un déclenchement automatique sur tag/release, n'affecte aucun autre composant du produit.
