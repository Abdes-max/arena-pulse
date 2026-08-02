# ADR 0004 — Déploiement : Docker auto-hébergeable, cible d'hébergement volontairement différée

## Statut

Accepté — `feat/035-deployment`.

## Contexte

`architecture-overview.md` prévoyait déjà `infra/deployment/` dans l'arborescence, mais rien n'y
avait été implémenté avant cette PR : pas de Dockerfile, pas de manifeste de déploiement, aucune
cible d'hébergement choisie. Avant de commencer, la question a été posée explicitement au porteur
de projet : PaaS (Railway/Render/Fly.io...), VPS auto-hébergé via Docker Compose, ou seulement les
briques génériques sans cible précise. Réponse : **seulement les briques génériques** — cohérent
avec les décisions déjà prises pour le prestataire de paiement
(`feat/034-player-registration-and-payments`, non commencé) et pour le tracking d'erreurs
(`docs/architecture/adr/0003-observability-strategy.md`) : ne pas provisionner de compte/service
externe sans que le porteur de projet ne le décide et ne le crée lui-même.

## Décision

1. **Dockerfiles multi-stage** (`infra/docker/api.Dockerfile`, `infra/docker/web.Dockerfile`) :
   - API (`node:22-slim`) : stage `build` (compile + `prisma generate`) et stage `runtime` élagué
     (`npm ci --omit=dev`, utilisateur non-root, `HEALTHCHECK` sur `/api/v1/health`).
   - Web (`node:22-slim` puis `nginxinc/nginx-unprivileged:1.27-alpine`) : build Angular de
     production, servi par nginx en non-root, avec `try_files` pour le routage SPA et un
     reverse-proxy `/api/` → le service `api` (voir point 3).
2. **`infra/deployment/docker-compose.prod.yml`** : la baseline générique auto-hébergeable —
   fonctionne sur n'importe quel hôte Docker (VPS compris), sans dépendance à un PaaS particulier.
   Un service `migrate` à usage unique (cible `build`, qui garde le CLI Prisma contrairement à
   `runtime`) exécute `prisma migrate deploy` avant que `api` ne démarre
   (`depends_on: condition: service_completed_successfully`).
3. **nginx sert l'app ET fait reverse-proxy vers l'API sur la même origine** : élimine tout besoin
   de CORS en usage normal, et corrige au passage un bug préexistant —
   `apps/web/src/environments/environment.ts` (le fichier réellement utilisé en build de
   production, `angular.json` n'a pas de `fileReplacement` pour la configuration `production`)
   avait `apiUrl` codé en dur sur `http://localhost:3000/api/v1`, donc **cassé dans n'importe quel
   build de production réel** jusqu'ici (jamais remarqué faute de déploiement effectif). Corrigé
   en `/api/v1` (relatif).
4. **Publication d'images sur GHCR (`ghcr.io`) depuis la CI**, uniquement sur push vers `master`
   après succès de `web`/`api`/`e2e` — utilise `GITHUB_TOKEN`, aucun compte externe à créer.
   `docker-publish` dans `.github/workflows/ci.yml`.
5. **Aucun déploiement réel exécuté** : ni serveur provisionné, ni domaine, ni certificat TLS —
   hors de portée sans une cible choisie par le porteur de projet. `infra/deployment/README.md`
   documente les étapes manuelles pour aller plus loin (pointer `docker-compose.prod.yml` vers un
   hôte réel, ou adapter les services `api`/`web` pour tirer les images GHCR au lieu de les
   reconstruire).
6. **Bug corrigé en cours de route** : `apps/api/package.json`'s `start:prod` lançait
   `node dist/main`, un chemin qui n'a jamais existé (la sortie réelle de `nest build` avec ce
   `nest-cli.json` est `dist/src/main.js`, pas `dist/main.js`) — `npm run start:prod` était cassé
   depuis toujours, jamais remarqué car le développement local utilise `start:dev`. Corrigé en
   `node dist/src/main`, vérifié en le lançant réellement.

## Justification

- Docker Compose auto-hébergeable est la baseline la plus portable : elle fonctionne identiquement
  qu'on choisisse ensuite un VPS nu, une offre "Docker Compose" d'un PaaS, ou tout autre hôte
  Docker — aucune de ces options n'est fermée par ce choix.
- Séparer `migrate` de `api` (plutôt qu'exécuter les migrations au démarrage du conteneur `api`
  lui-même) évite toute course entre plusieurs réplicas potentiels de `api` qui tenteraient
  chacun d'appliquer les migrations, et garde l'image `runtime` élaguée (pas de CLI Prisma en
  production).
- `nginx-unprivileged` plutôt que l'image `nginx` par défaut : cohérent avec le narratif déjà
  posé par `feat/030-security-hardening` (non-root partout où c'est possible).

## Conséquences

- **`apps/mobile` n'est pas concerné** par cette PR — c'est une app Ionic/Capacitor distribuée via
  les stores (Google Play/App Store), pas un service web à conteneuriser. Question hors périmètre
  ici, pas oubliée.
- **`MailModule` ne supporte pas l'authentification SMTP** (`SMTP_HOST`/`SMTP_PORT` seulement,
  vérifié dans `apps/api/src/mail/mail.service.ts`) — une vraie mise en production nécessite soit
  un relais SMTP sans authentification autorisé depuis l'IP de l'hôte, soit un ajout côté code
  (hors périmètre de cette PR, qui est infrastructure et non fonctionnel).
- Avant tout déploiement réel : générer un `JWT_SECRET` fort, définir `WEB_PUBLIC_ORIGIN` sur le
  domaine réel, et mettre un reverse-proxy terminant TLS devant `docker-compose.prod.yml` (qui ne
  sert que du HTTP en clair sur `WEB_HOST_PORT`) — `auth.controller.ts` positionne déjà le cookie
  de refresh en `Secure`, donc une session ne fonctionnera pas correctement tant que tout n'est pas
  servi en HTTPS.
- `infra/deployment/.env.example` liste toutes les variables requises ; `docker compose ... up`
  échoue explicitement (`:?`) si l'une d'elles manque, plutôt que de démarrer silencieusement avec
  une valeur par défaut dangereuse.

## Réversibilité

Les Dockerfiles et `docker-compose.prod.yml` sont indépendants de tout hébergeur — les remplacer
par un déploiement PaaS (Dockerfile déjà compatible avec la plupart d'entre eux) ou par des
manifestes Kubernetes n'affecte aucun autre composant du produit.
