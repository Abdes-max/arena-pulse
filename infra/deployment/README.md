# Déploiement

Stack de production auto-hébergeable (`docker-compose.prod.yml`) : PostgreSQL + API (NestJS) +
web (Angular servi par nginx, qui fait aussi reverse-proxy vers l'API). Voir
`docs/architecture/adr/0004-deployment-strategy.md` pour les décisions et leurs justifications.

Aucune cible d'hébergement n'est imposée par ces fichiers — ils fonctionnent sur n'importe quel
hôte Docker (VPS, offre "Docker Compose" d'un PaaS, etc.).

## Prérequis sur l'hôte cible

- Docker + Docker Compose v2 (`docker compose version` doit fonctionner).
- Un reverse-proxy terminant TLS **devant** cette stack (Caddy, Traefik, nginx sur l'hôte...) —
  cette stack ne sert que du HTTP en clair sur `WEB_HOST_PORT`. Sans HTTPS, l'authentification ne
  fonctionnera pas correctement (le cookie de rafraîchissement est posé en `Secure`).
- Un relais SMTP joignable sans authentification depuis cette IP (voir la limitation notée dans
  l'ADR 0004) ou un contournement applicatif.

## Déployer

```bash
# Depuis la racine du dépôt, sur l'hôte cible :
git clone <ce dépôt> && cd arena-pulse
cp infra/deployment/.env.example infra/deployment/.env
# Éditer infra/deployment/.env : POSTGRES_PASSWORD, JWT_SECRET (openssl rand -base64 48),
# WEB_PUBLIC_ORIGIN, SMTP_HOST/PORT au minimum.

docker compose -f infra/deployment/docker-compose.prod.yml --env-file infra/deployment/.env \
  up -d --build
```

Ceci construit les deux images localement sur l'hôte. Les images sont aussi publiées sur
`ghcr.io/<owner>/arena-pulse-api` et `ghcr.io/<owner>/arena-pulse-web` à chaque fusion sur
`master` (job `docker-publish` de la CI) — pour déployer depuis ces images pré-construites plutôt
que de reconstruire sur l'hôte, remplacer les blocs `build:` de `docker-compose.prod.yml` par
`image: ghcr.io/<owner>/arena-pulse-api:latest` (et `-web`) avant le `docker compose up`.

## Vérifier

```bash
curl -f http://localhost:${WEB_HOST_PORT:-8080}/api/v1/health
# {"status":"ok","info":{"database":{"status":"up"}},...}
```

`docker compose -f infra/deployment/docker-compose.prod.yml logs -f api` affiche les logs JSON
structurés (voir ADR 0003) — chaque ligne HTTP porte un `requestId` corrélé à toute erreur
associée.

## Mettre à jour

```bash
git pull
docker compose -f infra/deployment/docker-compose.prod.yml --env-file infra/deployment/.env \
  up -d --build
```

Le service `migrate` s'exécute avant `api` à chaque `up` et applique les migrations Prisma en
attente ; `api` ne démarre que si `migrate` s'est terminé avec succès.

## Sauvegarder

Les données PostgreSQL vivent dans le volume nommé `arena-pulse-postgres-prod` (déclaré dans
`docker-compose.prod.yml`) — sauvegarder ce volume (ou faire des dumps réguliers via
`docker compose exec postgres pg_dump ...`) selon la politique de sauvegarde de l'hôte choisi ;
rien n'est automatisé ici.
