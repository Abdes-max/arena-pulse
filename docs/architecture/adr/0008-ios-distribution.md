# ADR 0008 — Distribution iOS : correctifs mobile + CI GitHub Actions vers TestFlight

## Statut

Accepté et **opérationnel de bout en bout** (PR #67, puis correctif #74) : compte Apple Developer
Program créé (Apple ID dédié), App ID/certificat/profil de provisioning générés, les 8 secrets
GitHub renseignés, premier build archivé/signé/uploadé avec succès par `deploy-ios.yml`, installé
et fonctionnel via TestFlight sur un appareil réel. Voir "Notes pratiques" ci-dessous pour les
écueils réels rencontrés (absents du plan initial) et "Reste à faire" pour ce qui suit
(App Store public).

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

## Notes pratiques (vécues sur le premier run réel, absentes du plan initial)

- **`@capacitor/ios` 8.x génère un projet Swift Package Manager par défaut, pas CocoaPods** — pas
  de `App.xcworkspace` à la racine, seulement `App.xcodeproj` (le `project.xcworkspace` visible
  dedans est un détail interne d'Xcode). `deploy-ios.yml` archive donc avec `-project
  App.xcodeproj`, pas `-workspace`. Si un jour le template Capacitor repasse à CocoaPods (ou que le
  projet a un `Podfile`), il faudra inverser ce choix.
- **Le Team ID n'est pas nécessaire à chercher séparément** : il apparaît directement dans le sujet
  du certificat de distribution (`openssl x509 -inform DER -in distribution.cer -noout -subject`,
  champ `UID=`/`OU=`) — pas besoin de la page Membership si on a déjà le `.cer`.
- **Champ UGS (SKU) à la création de l'app dans App Store Connect** : purement interne, jamais
  visible publiquement, aucune contrainte de format particulière (utilisé `com.arenapulse.mobile`).
- **Question de conformité au chiffrement** : réponse "Aucun des algorithmes mentionnés ci-dessus"
  — l'app ne fait que du HTTPS standard via les mécanismes réseau natifs d'iOS (Capacitor
  WebView + Stripe côté client), aucune bibliothèque de chiffrement propre embarquée. **Piège
  découvert au 3e build réel** : cette réponse n'est pas mémorisée d'un build à l'autre — chaque
  nouvel upload arrive dans App Store Connect avec `usesNonExemptEncryption` à `null` ("Missing
  Compliance"), et reste invisible pour tout testeur TestFlight tant que quelqu'un ne la
  re-confirme pas manuellement pour *ce build précis*, même si le traitement Apple est terminé
  (`processingState: VALID`). `deploy-ios.yml` déclare maintenant `ITSAppUsesNonExemptEncryption =
  false` directement dans `Info.plist` à chaque run (étape "Declare export compliance") — plus
  besoin d'y repenser pour les prochains builds.
- **TestFlight, piste interne — deux pièges à la première utilisation** :
  1. Un groupe de test interne n'existe pas par défaut, il faut le créer explicitement
     (**TestFlight → Internal Testing → +**) avant de pouvoir y assigner un build.
  2. Les testeurs internes doivent être des **Users** déjà déclarés dans **Users and Access** de
     l'équipe App Store Connect — impossible d'inviter un email au vol comme pour les testeurs
     externes. Si l'Apple ID du téléphone de test diffère de l'Apple ID développeur dédié
     (cas courant), il faut d'abord l'ajouter comme User (rôle "Developer" suffit), attendre
     l'acceptation de l'invitation, puis seulement l'ajouter au groupe.
  3. La page "Test Information" (description bêta, "what to test") refuse parfois
     d'enregistrer ("Impossible d'enregistrer vos modifications") tant que les informations de
     contact "Beta App Review" (nom/email/téléphone) ne sont pas remplies, même si on ne touche
     que la description.

## Reste à faire (porteur de projet — pas automatisable)

1. ~~S'inscrire à l'Apple Developer Program~~ — fait (Apple ID dédié, individuel).
2. ~~App ID, certificat de distribution, profil de provisioning~~ — faits (CSR générée en local
   avec `openssl`, sans Mac, cf. ADR ; `.cer`/`.mobileprovision` téléchargés depuis Certificates,
   Identifiers & Profiles).
3. ~~App créée dans App Store Connect + clé API~~ — faites (rôle "App Manager").
4. ~~Team ID~~ — récupéré directement depuis le certificat (cf. "Notes pratiques").
5. ~~Secrets GitHub~~ — les 8 attendus par `deploy-ios.yml` sont renseignés.
6. ~~Premier run du workflow~~ — réussi après le correctif SPM (#74) ; build 1.0 (2) archivé,
   signé et uploadé.
7. ~~Groupe de test interne + questionnaire de conformité au chiffrement~~ — faits ; build
   installé et fonctionnel sur un appareil réel via TestFlight.
8. **Reste à faire** avant toute release publique (au-delà de TestFlight) : questionnaire **App
   Privacy** complet (doit refléter les comptes joueurs et les paiements Stripe,
   `docs/architecture/adr/0005-player-registration-and-payments.md`), captures d'écran par taille
   d'appareil, description longue, catégorie, URL de politique de confidentialité, classification
   d'âge. Icônes/splash toujours les placeholders par défaut de Capacitor — à personnaliser avant
   toute sortie publique, idéalement en même temps pour les deux plateformes (cf. ADR 0009).

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
