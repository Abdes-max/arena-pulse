# ADR 0009 — Distribution Android : CI GitHub Actions vers Google Play (piste interne)

## Statut

Accepté pour la partie code (workflow CI) — le compte Google Play Console n'est pas encore créé,
donc `deploy-android.yml` ne peut pas encore tourner avec succès. Voir "Reste à faire (porteur de
projet)" ci-dessous. Fait suite à `docs/architecture/adr/0008-ios-distribution.md`, qui laissait
explicitement Android hors périmètre.

## Contexte

`apps/mobile/android/` existe déjà en local (jamais commité, gitignored comme `ios/` maintenant
l'est aussi — régénéré via `npx cap add android`), mais il n'y avait aucune automatisation pour
construire/signer/publier vers le Play Store. Contrairement à iOS, Android ne nécessite ni Mac ni
runner `macos-latest` : le build Gradle tourne nativement sur `ubuntu-latest`, comme le reste de la
CI de ce dépôt.

Les correctifs de l'ADR 0008 (URL d'API absolue en production, `CORS_ORIGIN` incluant les origines
natives Capacitor, cookies `sameSite: 'none'` en production) s'appliquaient déjà aux deux
plateformes — rien à refaire ici sur ce plan.

## Décision

1. **`.github/workflows/deploy-android.yml`** (`workflow_dispatch`, `runs-on: ubuntu-latest`) :
   build Angular → `npx cap add android && npx cap sync android` (le dossier `android/` n'est
   jamais commité, régénéré à chaque run) → patch du `versionCode`/`versionName` généré par le
   template Capacitor (toujours `1`/`"1.0"`, il n'y a pas de fichier commité à incrémenter d'un run
   à l'autre) → injection de la configuration de signature via un script d'initialisation Gradle
   (`--init-script`, garde le keystore et les mots de passe hors de tout fichier versionné ou
   loggué) → `./gradlew bundleRelease` → upload vers la piste **interne** (équivalent TestFlight)
   via `r0adkll/upload-google-play`, qui encapsule l'API Google Play Developer Publishing —
   même catégorie d'action tierce établie que `docker/build-push-action` déjà utilisée dans
   `ci.yml`.
2. **Keystore de upload déjà généré** (`keytool`, local, aucun compte requis) — `alias
   tournarena-upload`, validité 25 ans, format PKCS12 (mot de passe unique pour le store et la clé,
   `keytool` ignore silencieusement un `-keypass` distinct sur ce format). Contrairement à iOS, pas
   de certificat à faire signer par un tiers : Google gère la clé d'app réelle via **Play App
   Signing**, ce keystore ne sert qu'à l'upload initial.

## Reste à faire (porteur de projet — pas automatisable)

1. **Compte Google Play Console** (25 $, paiement unique, pas d'abonnement contrairement à Apple)
   sur [play.google.com/console/signup](https://play.google.com/console/signup) — compte Google
   existant réutilisé (décision du porteur de projet, contrairement à l'Apple ID dédié créé pour
   iOS). Vérification généralement rapide.
2. Créer l'app dans Play Console (**Créer une application**) — nom "TournArena", nom de package
   **`com.arenapulse.mobile`** (doit correspondre exactement à `capacitor.config.ts` ; **immuable
   une fois le premier artefact envoyé**, comme le Bundle ID iOS).
3. **Setup → API access** : lier/créer un projet Google Cloud, créer un compte de service, lui
   accorder l'accès dans Play Console (rôle avec permission "Release apps to testing tracks"
   suffit), télécharger la clé JSON.
4. Compléter les formulaires obligatoires avant toute piste de test : **Data safety** (équivalent
   du questionnaire App Privacy d'Apple — doit refléter comptes joueurs et paiements Stripe,
   `docs/architecture/adr/0005-player-registration-and-payments.md`), classification de contenu,
   audience cible, politique de confidentialité (même URL que pour iOS).
5. Encoder le keystore en base64 et ajouter les 5 secrets GitHub — liste exacte en en-tête de
   `deploy-android.yml`.
6. Lancer manuellement le workflow (onglet Actions → "Deploy Android to Play Console (internal
   track)").
7. Ajouter des testeurs internes dans Play Console une fois le premier build en `draft` sur la
   piste interne.

## Justification

- `ubuntu-latest` plutôt qu'un runner macOS : Android ne l'exige pas, et c'est nettement moins
  cher/plus rapide en minutes CI — aucune raison de payer le coût macOS ici.
- Script d'initialisation Gradle plutôt qu'un patch de `android/app/build.gradle` committé : le
  fichier n'existe pas entre deux runs (régénéré par `cap add`), et garder le keystore/mots de
  passe dans un fichier séparé du build.gradle limite leur exposition dans les logs/diffs.
- Piste interne d'abord (comme TestFlight pour iOS) plutôt que production directe : permet de
  valider un build réel avant toute visibilité publique.

## Conséquences

- Icônes et splash screen restent les placeholders par défaut de Capacitor, comme noté dans
  l'ADR 0008 — à traiter une fois pour les deux plateformes, pas indépendamment.
- Le workflow échouera tant que les 5 secrets ne sont pas renseignés — attendu, documenté en
  en-tête plutôt que découvert au premier run, même logique que `deploy-ios.yml`.
- Contrairement à iOS, aucune vérification d'identité bloquante n'est généralement attendue pour un
  compte individuel Google Play — le délai jusqu'à un premier build en piste interne devrait être
  plus court que pour TestFlight.

## Réversibilité

Le workflow est indépendant de tout service tiers de build mobile. Remplacer
`r0adkll/upload-google-play` par un appel direct à l'API Play Developer Publishing, ou le
déclenchement manuel par un déclenchement automatique sur tag/release, n'affecte aucun autre
composant du produit.
