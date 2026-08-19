# ADR 0009 — Distribution Android : CI GitHub Actions vers Google Play (piste interne)

## Statut

Accepté et opérationnel — `deploy-android.yml` a tourné avec succès pour la première fois le
2026-08-19 (build signé + upload vers la piste interne de Play Console). Le compte Google Play
Console a été créé par le porteur de projet, le projet Google Cloud `tournarena-play-deploy` et son
compte de service (`tournarena-play-deploy@tournarena-play-deploy.iam.gserviceaccount.com`, rôle
Administrateur sur l'app TournArena dans Play Console) ont été mis en place, et les 5 secrets requis
sont configurés dans GitHub Actions. Fait suite à `docs/architecture/adr/0008-ios-distribution.md`,
qui laissait explicitement Android hors périmètre. La section "Reste à faire (porteur de projet)"
ci-dessous documente le cheminement suivi, désormais complété — conservée pour référence si le
processus doit être refait (nouveau compte, nouvelle machine, secret perdu).

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

1. **`.github/workflows/deploy-android.yml`** (`push` vers `master` + `workflow_dispatch`,
   `runs-on: ubuntu-latest`) :
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

## Déploiement automatique sur merge + promotion manuelle (ajouté après coup, 2026-08-19)

**`deploy-android.yml` se déclenche désormais aussi sur `push` vers `master`** (en plus de
`workflow_dispatch`, gardé pour un re-run manuel), même modèle que `deploy-prod.yml`/
`deploy-ios.yml` : chaque merge de PR construit, signe et envoie automatiquement une nouvelle
release sur la piste **interne** — jamais directement en production. C'est délibérément la même
piste de test qu'auparavant, juste déclenchée sans action humaine plutôt qu'à la demande.

**`.github/workflows/promote-android-production.yml`** + **`infra/scripts/promote-android-release.mjs`** :
promeut vers la piste production la release déjà testée sur la piste interne — jamais un nouveau
build. Utilise directement l'API Play Developer Publishing (mêmes secrets que `deploy-android.yml`
ci-dessus, aucun nouveau secret) : ouvre un edit, lit les `versionCodes` de la release interne
demandée (ou la plus récente), les republie sur la piste `production` (déploiement complet ou
progressif via `userFraction` si `rollout_fraction` < 1), commit l'edit. Délibérément **pas** de
dépendance à `googleapis` (gros paquet pour une poignée d'appels REST) — authentification par JWT
RS256 signé à la main avec le module `crypto` natif de Node, échangé contre un jeton OAuth2 via le
flux `urn:ietf:params:oauth:grant-type:jwt-bearer`, même logique que le module `crypto`/ES256 de
`infra/scripts/submit-ios-app-store.mjs` côté iOS.

## Reste à faire (porteur de projet — pas automatisable)

**Tout ce qui suit a été complété le 2026-08-19** (le workflow tourne avec succès) — section
conservée telle quelle pour référence si le processus doit être refait un jour (compte perdu, autre
projet, secret régénéré).

1. **Compte Google Play Console** (25 $, paiement unique, pas d'abonnement contrairement à Apple)
   sur [play.google.com/console/signup](https://play.google.com/console/signup) — compte Google
   existant réutilisé (décision du porteur de projet, contrairement à l'Apple ID dédié créé pour
   iOS). Vérification généralement rapide.
2. Créer l'app dans Play Console (**Créer une application**) — nom "TournArena", nom de package
   **`com.arenapulse.mobile`** (doit correspondre exactement à `capacitor.config.ts` ; **immuable
   une fois le premier artefact envoyé**, comme le Bundle ID iOS).
3. **Compte de service : la page "Setup → API access" documentée par Google ne s'est jamais affichée
   dans Play Console pour ce compte** (recherchée exhaustivement : Accueil, Utilisateurs et
   autorisations, Paramètres, Compte de développeur, Tester et publier, Paramètres avancés — absente
   partout, y compris après vérification d'identité complète). Plusieurs guides tiers à jour (2026 :
   RevenueCat, AppsFlyer, Codemagic, Adjust) confirment que ce n'est plus le chemin à suivre. **Chemin
   qui fonctionne réellement** : créer le compte de service directement dans
   [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts) (un projet GCP
   dédié, ex. `tournarena-play-deploy` ; activer l'API "Google Play Android Developer API" ; créer le
   compte de service ; onglet Clés → Créer une clé → JSON), puis dans Play Console → **Utilisateurs et
   autorisations → Inviter de nouveaux utilisateurs**, coller l'adresse e-mail du compte de service
   (`<nom>@<projet>.iam.gserviceaccount.com`) et lui accorder le rôle **Administrateur** (ou, plus
   fin, la permission "Release apps to testing tracks" sur l'app) — comme pour un utilisateur humain.
4. Compléter les formulaires obligatoires avant toute piste de test **au-delà de la piste interne**
   (déjà franchie) : **Data safety** (équivalent du questionnaire App Privacy d'Apple — doit refléter
   comptes joueurs et paiements Stripe, `docs/architecture/adr/0005-player-registration-and-payments.md`),
   classification de contenu, audience cible, politique de confidentialité (même URL que pour iOS) —
   **non encore fait**, à traiter avant de passer en test ouvert/fermé ou en production.
5. Encoder le keystore en base64 et ajouter les 5 secrets GitHub — liste exacte en en-tête de
   `deploy-android.yml`. Le premier keystore généré (par un travail antérieur) n'existait plus sur la
   machine au moment de reprendre ce chantier ; un nouveau a été régénéré (`keytool`, PKCS12, alias
   `tournarena-upload`, validité 25 ans) — sans conséquence, puisque Google gère la clé d'app réelle
   via Play App Signing (voir plus haut) et ce keystore ne sert qu'à l'upload initial.
6. Lancer manuellement le workflow (onglet Actions → "Deploy Android to Play Console (internal
   track)") — premier run réussi le 2026-08-19.
7. Ajouter des testeurs internes dans Play Console une fois le premier build en `draft` sur la
   piste interne — pas encore fait.

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
`r0adkll/upload-google-play` par un appel direct à l'API Play Developer Publishing, ou revenir à un
déclenchement purement manuel (retirer le trigger `push`), n'affecte aucun autre composant du
produit.
