# Audit de sécurité — arena-pulse

**Date** : 20 août 2026
**Périmètre** : backend API (`apps/api`), frontend web (`apps/web` — site public, panneau organisateur, panneau super-admin, utilisé aussi en mobile web), application mobile native iOS/Android (`apps/mobile`, Ionic/Capacitor).
**Méthode** : revue de code exhaustive (recherche par motifs sur l'ensemble des sources, lecture des guards/DTOs/services critiques, calcul de ratios), `npm audit`, et vérifications ciblées en navigateur sur le site de production. Aucune correction n'a été appliquée — ce document est un rapport de constats, pas un correctif.

---

## ⚠️ Incident potentiel observé en direct pendant l'audit — à vérifier en priorité absolue

En tentant de charger `https://tournarena.com/` pour les vérifications navigateur de cet audit, la connexion TLS a échoué de façon reproductible (deux onglets distincts, même session Chrome) :

- `https://tournarena.com/` → **`ERR_SSL_VERSION_OR_CIPHER_MISMATCH`** — échec de la négociation TLS elle-même, avant toute réponse HTTP.
- `http://tournarena.com/` → **`HTTP ERROR 403`** (« Vous n'êtes pas autorisé à consulter cette page »).
- `https://www.google.com` s'est chargé normalement dans le même navigateur au même moment — le problème n'est pas un souci réseau général du poste, il est spécifique au domaine `tournarena.com`.

**Ceci n'est pas un constat de sécurité classique du code — c'est une observation en temps réel qui suggère que le site de production pourrait être inaccessible pour de vrais visiteurs au moment de cet audit.** Elle n'a pas pu être confirmée comme persistante (la vérification navigateur a été interrompue avant un second essai). **Priorité recommandée : vérifier immédiatement l'état du site et des certificats TLS en production** (état du conteneur Caddy/nginx, validité et chaîne du certificat, configuration TLS de `infra/deployment/`) avant de traiter le reste de ce rapport.

---

## Résumé exécutif

| Gravité | # | Zone |
| --- | --- | --- |
| Élevée | 2 | Backend (SSRF import CSV), Frontend (absence CSP/en-têtes) |
| Moyenne | 4 | Backend (refresh token en clair, secrets dans les URLs loggées, politique mot de passe faible), Frontend (suppressions sans confirmation) |
| Faible | 6 | Backend (validation incomplète des DTOs, type de fichier non vérifié en profondeur, fuite d'état login, absence de verrouillage de compte, dépendances npm), Frontend (`returnUrl` non validé) |
| Info (bonnes pratiques confirmées) | 8 | Stockage des tokens, CSRF, CSP mobile, dépendances web, `autocomplete`, CI/CD secrets, permissions mobile, absence de pinning (acceptable) |

Constat général : le code applicatif est **globalement solide** — hashing argon2id, rotation de refresh token avec détection de vol/replay, cloisonnement organisation/tournoi vérifié systématiquement à la fois par les guards et par les services, montants de paiement toujours calculés côté serveur, webhook Stripe vérifié par signature, stockage des tokens d'accès en mémoire uniquement (jamais `localStorage`), CORS strict. Les points les plus sérieux concernent une fonctionnalité d'import (SSRF) et l'absence d'en-têtes de sécurité HTTP au niveau infrastructure.

---

## Backend (`apps/api`)

### [Élevée] SSRF authentifié via l'import CSV d'équipes
- **Fichier** : `apps/api/src/tournaments/teams.service.ts:287-327`
- **Catégorie** : CWE-918 (SSRF) / OWASP A10
- **Problème** : `resolveImportLogoUrl()` effectue un `fetch()` serveur sur toute URL http(s) fournie dans la colonne `logo` d'un CSV d'import d'équipes, sans aucune restriction d'hôte/IP.
- **Scénario d'exploitation** : un organisateur authentifié (permission `MANAGE_PARTICIPANTS`) importe un CSV avec une URL logo pointant vers `http://169.254.169.254/...` ou un service interne. Le fetch part du serveur ; le message d'erreur réseau brut (HTTP xxx / ECONNREFUSED / timeout) est renvoyé dans le champ `warning` de la réponse — un oracle de scan réseau interne. Si le service interne répond avec un Content-Type `image/*`, le corps est stocké et publié sous `/uploads/team-logos/`.
- **Recommandation** : bloquer les plages privées/loopback/link-local/metadata (résolution DNS avant fetch, y compris après redirection), et ne renvoyer qu'un message d'erreur générique au client.

### [Moyenne] Refresh token renvoyé en clair dans le JSON au lieu d'un cookie httpOnly (acceptation d'invitation)
- **Fichier** : `apps/api/src/organizations/invitations.controller.ts:22-32` ; `apps/api/src/organizations/invitations.service.ts:212-236`
- **Catégorie** : CWE-522 / OWASP A07
- **Problème** : contrairement à `AuthController` (login/register/refresh), `POST /invitations/:token/accept` ne pose pas de cookie httpOnly : le refresh token créé lors de la création de compte via invitation est renvoyé directement dans le corps JSON.
- **Scénario d'exploitation** : tout code frontend (ou XSS futur) ayant accès à la réponse JSON récupère un refresh token valable 30 jours, cassant le modèle « jamais accessible en JS » appliqué partout ailleurs.
- **Recommandation** : faire poser un cookie httpOnly par cette route comme les autres flux d'auth, et retirer `refreshToken`/`refreshTokenExpiresAt` du corps de réponse.

### [Moyenne] Jetons à usage unique présents dans les URLs, donc dans les logs applicatifs
- **Fichier** : `apps/api/src/auth/auth.controller.ts:59` ; `apps/api/src/organizations/invitations.controller.ts:16,22` ; `apps/api/src/common/interceptors/logging.interceptor.ts:29,58-74`
- **Catégorie** : CWE-532 (Insertion of Sensitive Information into Log File)
- **Problème** : `LoggingInterceptor` logue `originalUrl` pour chaque requête, et les routes `verify-email/:token`, `invitations/:token`, `invitations/:token/accept` portent le secret dans le chemin.
- **Scénario d'exploitation** : accès aux logs (log management compromis, opérateur, fuite) → rejeu du lien de vérification/invitation avant l'usage légitime.
- **Recommandation** : ne pas placer de secrets à usage unique dans un chemin d'URL loggé ; les faire transiter en corps de requête POST, ou filtrer ces routes du logging détaillé de l'URL.

### [Moyenne] Politique de mot de passe minimale (8 caractères, aucune contrainte de complexité)
- **Fichier** : `apps/api/src/auth/dto/register.dto.ts:8` ; `apps/api/src/player-auth/dto/player-register.dto.ts:8` ; `apps/api/src/organizations/dto/accept-invitation.dto.ts:12`
- **Catégorie** : OWASP ASVS V2.1 / CWE-521
- **Problème** : seul `@MinLength(8)` est appliqué, sans contrôle de complexité ni de liste de mots de passe compromis.
- **Scénario d'exploitation** : credential stuffing avec des mots de passe faibles satisfaisant la règle (`password1`), sur des comptes organisateurs gérant potentiellement plusieurs tournois/organisations.
- **Recommandation** : augmenter la longueur minimale (10-12) et/ou ajouter une vérification côté serveur (zxcvbn, HaveIBeenPwned k-anonymity).

### [Moyenne] Suppressions destructrices (équipe, arbitre) sans confirmation côté web — *voir aussi section Frontend*
Voir constat détaillé dans la section Frontend ci-dessous.

### [Faible] Absence systématique de `@MaxLength` sur les champs texte des DTOs
- **Fichier** : `apps/api/src/tournaments/dto/create-tournament.dto.ts:14` ; `apps/api/src/tournaments/dto/create-team.dto.ts` ; `apps/api/src/tournaments/dto/import-teams.dto.ts:5` (et de nombreux autres DTOs du même module)
- **Catégorie** : CWE-1284 / OWASP A04
- **Problème** : type validé (`@IsString`) mais aucune longueur maximale sur `name`, `managerName`, `csv`, etc.
- **Scénario d'exploitation** : un utilisateur authentifié à faibles privilèges (ex. joueur en auto-inscription publique) peut soumettre des chaînes volumineuses (jusqu'à la limite du body-parser Express, ~100 Ko) répétées sur des ressources sans quota, dégradant stockage et rendu.
- **Recommandation** : ajouter `@MaxLength()` cohérent avec l'usage métier sur l'ensemble des champs texte.

### [Faible] Validation du type de fichier logo basée uniquement sur le Content-Type déclaré par le client
- **Fichier** : `apps/api/src/tournaments/teams.service.ts:32-36,261-266` (équivalent dans `tournaments.service.ts`)
- **Catégorie** : CWE-434 (Unrestricted Upload of File with Dangerous Type)
- **Problème** : `file.mimetype` (fourni par multer depuis l'en-tête de la partie multipart) est utilisé pour choisir l'extension de stockage, sans inspection des magic bytes.
- **Scénario d'exploitation** : upload d'un fichier HTML/SVG avec un Content-Type falsifié en `image/png`, stocké et servi sous `/uploads/team-logos/`. Risque atténué par `X-Content-Type-Options: nosniff` (Helmet actif côté API), mais défense en profondeur manquante.
- **Recommandation** : valider le type réel via inspection des octets (ex. lib `file-type`) en complément du Content-Type déclaré.

### [Faible] Distinction observable entre « identifiants invalides » et « compte non vérifié » sur `/auth/login`
- **Fichier** : `apps/api/src/auth/auth.service.ts:130-148`
- **Catégorie** : CWE-203 (Observable Discrepancy) / OWASP A07
- **Problème** : réponse `403` distincte (« Vérifiez votre email ») uniquement si mot de passe correct + compte non vérifié, vs `401` générique sinon.
- **Scénario d'exploitation** : nécessite déjà un mot de passe correct pour être exploitable — impact limité, mais fuite d'état involontaire.
- **Recommandation** : à évaluer selon la tolérance produit ; pas d'action urgente.

### [Faible] Absence de verrouillage de compte après échecs répétés (uniquement rate limiting par IP)
- **Fichier** : `apps/api/src/auth/auth.controller.ts:34-39` (et équivalents `player-auth`/`super-admin-auth`)
- **Catégorie** : CWE-307 / OWASP A07
- **Problème** : `@Throttle` limite à 5/min par IP (3/min pour le super-admin), mais aucun compteur d'échecs par compte.
- **Scénario d'exploitation** : bruteforce ciblé sur un compte précis depuis plusieurs IP (botnet/proxies), chaque IP restant sous le seuil.
- **Recommandation** : ajouter un verrouillage progressif ou un CAPTCHA par compte après N échecs, en complément du rate limiting IP déjà en place.

### [Faible] Vulnérabilités npm de sévérité élevée dans les dépendances de production de l'API
- **Fichier** : `apps/api/package.json`
- **Catégorie** : OWASP A06 (Vulnerable and Outdated Components)
- **Problème** : `npm audit --production` dans `apps/api` rapporte 4 avis High : `deepmerge-ts` (<8.0.0, via `@prisma/config`→`prisma`, épuisement de pile), `fast-uri` (3.0.0–3.1.4, confusion d'hôte via backslash), `js-yaml` (5.0.0–5.2.1 via `@nestjs/swagger`, DoS parsing exponentiel), `nanoid` (<3.3.18, boucle infinie).
- **Scénario d'exploitation** : dépend de l'exposition réelle de chaque paquet (ex. `js-yaml`/`@nestjs/swagger` n'intervient qu'à la génération de la doc Swagger, pas sur le chemin de requête utilisateur) — à vérifier package par package plutôt que par supposition générique.
- **Recommandation** : `npm audit fix` pour `fast-uri`/`js-yaml`/`nanoid` ; évaluer séparément la montée de version majeure de `prisma` (`--force`) avec tests de non-régression.

### [Info] Points positifs confirmés — backend
- CORS avec liste blanche stricte, échec explicite si `CORS_ORIGIN` absent en production (`apps/api/src/main.ts`).
- Helmet actif ; `ValidationPipe` global `whitelist`/`forbidNonWhitelisted`.
- Hashing argon2id ; rotation de refresh token avec détection de vol/replay (révocation de toute la famille) sur les 3 flux d'auth (organisateur, joueur, super-admin).
- Webhook Stripe vérifié par signature (`constructWebhookEvent`), montants toujours calculés côté serveur.
- Cloisonnement organisation/tournoi vérifié systématiquement au niveau service (pas seulement guard) sur toutes les ressources imbriquées examinées (équipes, joueurs, matchs, scores, arbitres, sites).
- Aucun secret commité (`.env` absent du repo, `.env.example` propre).

---

## Frontend web (`apps/web`) — desktop et mobile web

### [Élevée] Aucune Content-Security-Policy ni en-têtes anti-clickjacking
- **Fichier** : `apps/web/src/index.html` (pas de meta CSP) ; `infra/docker/web.nginx.conf` ; `infra/deployment/Caddyfile`
- **Catégorie** : CSP / Clickjacking / En-têtes de sécurité
- **Problème** : ni le nginx qui sert le SPA, ni le reverse-proxy Caddy en frontal, ni `index.html`, n'ajoutent `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options` ou `Strict-Transport-Security`. Aucun en-tête de sécurité n'est envoyé sur les 3 zones (public, admin, super-admin).
- **Scénario d'exploitation** : un attaquant embarque `/login`, `/admin/login` ou `/super-admin/login` dans une iframe sur un site tiers et superpose une UI trompeuse (clickjacking) pour piéger la saisie d'identifiants ou un clic de confirmation. L'absence de CSP supprime aussi une couche de défense en profondeur en cas de future faille XSS.
- **Recommandation** : ajouter dans `infra/docker/web.nginx.conf` (ou Caddy) : `X-Frame-Options: DENY`, une CSP restrictive (`default-src 'self'; frame-ancestors 'none'; script-src 'self'; connect-src 'self'; ...`), `X-Content-Type-Options: nosniff`, `Strict-Transport-Security` (porté idéalement par Caddy qui gère déjà le TLS).

### [Moyenne] Suppressions destructrices (équipe, arbitre) sans confirmation, boutons adjacents
- **Fichier** : `apps/web/src/app/admin/pages/teams/team-list.page.ts:211-222` (`removeTeam`), `:291-304` (`deleteSelected`) ; `apps/web/src/app/admin/pages/teams/team-list.page.html:170-178` ; comportement similaire dans `apps/web/src/app/admin/pages/referees/referee-list.page.ts`
- **Catégorie** : Tapjacking / UX de sécurité (mobile web)
- **Problème** : suppression déclenchée directement au clic, sans boîte de dialogue de confirmation ni réutilisation du composant `ap-type-to-confirm` (déjà en place pour les suppressions de compte/organisation depuis les PR #169/#171). Sur mobile, les boutons Modifier/Joueurs/Supprimer sont empilés en pleine largeur, ce qui limite mais n'élimine pas le risque de fausse manipulation.
- **Recommandation** : ajouter une confirmation (réutiliser `ap-type-to-confirm` du design system) avant `removeTeam`, `deleteSelected`, et l'équivalent dans `referee-list.page.ts`.

### [Faible] `returnUrl` non validé avant redirection post-login
- **Fichier** : `apps/web/src/app/admin/pages/login/login.page.ts:43-44` ; `apps/web/src/app/pages/player-auth/login/player-login.page.ts:37-38` ; `apps/web/src/app/pages/player-auth/register/player-register.page.ts:39-40` ; `apps/web/src/app/super-admin/pages/login/super-admin-login.page.ts:37-39` ; sources : `apps/web/src/app/admin/core/auth.guard.ts:11`, `apps/web/src/app/core/player-auth.guard.ts:11`, `apps/web/src/app/super-admin/core/super-admin-auth.guard.ts:11`, `apps/web/src/app/admin/pages/accept-invitation/accept-invitation.page.ts:92-95`
- **Catégorie** : Redirection ouverte (open redirect)
- **Problème** : `returnUrl` est lu depuis les query params puis passé tel quel à `router.navigateByUrl(returnUrl)`, sans validation de forme. L'impact est aujourd'hui limité (le routeur Angular résout la chaîne comme un arbre de routes internes, pas une navigation plein-navigateur vers un domaine externe), mais aucune défense explicite n'existe si ce comportement change ou si une redirection future passe par `window.location`.
- **Recommandation** : valider `returnUrl` avec une regex stricte (refuser tout ce qui commence par `//`, contient `:` avant le premier `/`), avec repli sur la route par défaut sinon.

### [Info] Points positifs confirmés — frontend web
- **Stockage des tokens** : les 3 services d'authentification (organisateur, super-admin, joueur) stockent l'`accessToken` uniquement en mémoire (`signal`), jamais dans `localStorage`/`sessionStorage`. Le refresh token n'est jamais lu/manipulé côté client (`withCredentials: true`, cookie httpOnly).
- **CSRF** : les 3 intercepteurs attachent systématiquement `Authorization: Bearer <token>` sur toutes les routes mutantes constatées — neutralise le CSRF classique puisque l'autorisation ne repose jamais sur le seul cookie de session.
- **XSS** : aucun `[innerHTML]`, `outerHTML`, `bypassSecurityTrustHtml` sur du contenu utilisateur — le seul usage de `bypassSecurityTrustHtml` (`libs/design-system/src/lib/qr-code/qr-code.ts:36-57`) encode une URL publique du tournoi (slug), pas un champ libre organisateur. Les champs texte libre (description, règlement) sont rendus via interpolation Angular `{{ }}`, échappée automatiquement. Aucun `<iframe>`, `eval(`, `new Function(`.
- **`autocomplete`** : correctement configuré (`email`, `current-password`, `new-password`) sur tous les formulaires de connexion/inscription des 3 zones — permet aux gestionnaires de mots de passe mobiles de fonctionner.
- **Dépendances** : `npm audit --omit=dev` à la racine retourne 0 vulnérabilité sur les 70 dépendances de production. Les vulnérabilités de `npm audit` complet concernent uniquement des `devDependencies` d'outillage mobile (`@capacitor/assets`, `@trapezedev/project`), jamais expédiées dans le bundle navigateur.

---

## Mobile natif iOS/Android (`apps/mobile`)

Contexte important : l'app mobile est un **client public en lecture seule** — pas d'authentification embarquée (« Connexion »/« Créer un tournoi » ouvrent le site web via `target="_blank" rel="noopener"`). La surface de risque est donc structurellement réduite (pas de token à protéger côté mobile).

### [Info] Aucun constat Critique/Élevé — configuration native saine
Points vérifiés et jugés conformes :
- `apps/mobile/capacitor.config.ts:1-27` : pas de `server.cleartext`, pas de `server.allowNavigation` en wildcard, pas de scheme personnalisé risqué.
- `apps/mobile/src/environments/environment.ts:13` : `apiUrl` HTTPS absolu en production ; l'URL HTTP locale n'existe que dans `environment.development.ts`, jamais en build de production (confirmé via `angular.json`).
- Stockage : `favorites.service.ts`/`offline-cache.service.ts` utilisent `localStorage` uniquement pour des données publiques non sensibles (favoris, cache de lecture) — cohérent avec l'absence d'authentification mobile.
- Permissions natives (`@capacitor/clipboard`, `@capacitor/local-notifications`, `@capacitor/share`) toutes justifiées et minimales — pas de caméra/géolocalisation/push distant.
- Deep links/Universal Links : non implémentés actuellement — pas de risque d'injection de navigation par ce vecteur à ce stade.
- CI/CD (`deploy-ios.yml`, `deploy-android.yml`, `submit-ios-app-store.yml`, `promote-android-production.yml`) : secrets systématiquement référencés via `secrets.*`, jamais en clair. Certificats/keystore décodés dans un répertoire éphémère (`$RUNNER_TEMP`), keychain iOS explicitement supprimé en fin de job (`if: always()`).

### [Info] Pas de certificate pinning
- **Fichier** : `apps/mobile/src/environments/environment.ts:13`
- **Problème** : aucun épinglage de certificat pour les appels vers `tournarena.com/api/v1`.
- **Recommandation** : acceptable en l'état (pas d'auth, pas de paiement dans l'app mobile). À reconsidérer si des flux sensibles y sont ajoutés.

---

## Annexe — méthode et limites

- Revue de code par recherche exhaustive de motifs (auth, guards, `innerHTML`, `localStorage`, secrets, en-têtes serveur, etc.) plutôt que test d'intrusion actif — aucune tentative d'exploitation réelle n'a été effectuée.
- `npm audit` exécuté en local, à un instant T — à ré-exécuter périodiquement (idéalement automatisé en CI).
- Les vérifications navigateur prévues sur le site de production ont été interrompues par l'échec TLS décrit en tête de document — le contenu runtime (en-têtes HTTP effectivement envoyés en production, comportement live) n'a donc pas pu être confirmé directement et repose sur la configuration source (`infra/docker/web.nginx.conf`, `infra/deployment/Caddyfile`) au moment de l'audit.
