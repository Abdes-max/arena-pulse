# Déploiement

Stack de production auto-hébergeable (`docker-compose.prod.yml`) : PostgreSQL + API (NestJS) +
web (Angular servi par nginx, qui fait aussi reverse-proxy vers l'API) + Caddy (reverse-proxy
terminant le TLS, devant tout le reste). Voir `docs/architecture/adr/0004-deployment-strategy.md`
pour les décisions et leurs justifications.

Aucune cible d'hébergement n'est imposée par ces fichiers — ils fonctionnent sur n'importe quel
hôte Docker (VPS, offre "Docker Compose" d'un PaaS, etc.).

## Prérequis sur l'hôte cible

- Docker + Docker Compose v2 (`docker compose version` doit fonctionner).
- Un nom de domaine dont les enregistrements DNS (`A`, pour le domaine nu **et** `www.`) pointent
  déjà vers l'IP publique de cet hôte — Caddy en a besoin pour obtenir un certificat Let's Encrypt
  au premier démarrage. Si un template d'hébergeur propose déjà Traefik (ou un autre reverse-proxy)
  préinstallé, ne pas le combiner avec cette stack : les deux voudraient les ports 80/443 — choisir
  un template "Docker" nu à la place.
- Ports **80 et 443 ouverts** vers l'extérieur (pare-feu / groupe de sécurité) — 80 sert au défi
  ACME HTTP-01 de Let's Encrypt, pas seulement à rediriger vers 443.
- Un relais SMTP joignable sans authentification depuis cette IP (voir la limitation notée dans
  l'ADR 0004) ou un contournement applicatif.

## Déployer

```bash
# Depuis la racine du dépôt, sur l'hôte cible :
git clone <ce dépôt> && cd arena-pulse
cp infra/deployment/.env.example infra/deployment/.env
# Éditer infra/deployment/.env : POSTGRES_PASSWORD, JWT_SECRET (openssl rand -base64 48),
# DOMAIN, WEB_PUBLIC_ORIGIN, SMTP_HOST/PORT au minimum.

docker compose -f infra/deployment/docker-compose.prod.yml --env-file infra/deployment/.env \
  up -d --build
```

Ceci construit les images localement sur l'hôte. Les images `api`/`web` sont aussi publiées sur
`ghcr.io/<owner>/arena-pulse-api` et `ghcr.io/<owner>/arena-pulse-web` à chaque fusion sur
`master` (job `docker-publish` de la CI) — pour déployer depuis ces images pré-construites plutôt
que de reconstruire sur l'hôte, remplacer les blocs `build:` correspondants dans
`docker-compose.prod.yml` par `image: ghcr.io/<owner>/arena-pulse-api:latest` (et `-web`) avant le
`docker compose up`.

## Vérifier

Avant que le DNS ne soit propagé (ou pour un diagnostic depuis l'hôte lui-même), en contournant
Caddy :

```bash
curl -f http://localhost:${WEB_HOST_PORT:-8080}/api/v1/health
# {"status":"ok","info":{"database":{"status":"up"}},...}
```

Une fois le DNS propagé et Caddy démarré (ça peut prendre quelques dizaines de secondes le temps
d'obtenir le certificat) :

```bash
curl -f https://${DOMAIN}/api/v1/health
```

`docker compose -f infra/deployment/docker-compose.prod.yml logs -f api` affiche les logs JSON
structurés (voir ADR 0003) — chaque ligne HTTP porte un `requestId` corrélé à toute erreur
associée. `docker compose -f infra/deployment/docker-compose.prod.yml logs -f caddy` montre
l'obtention/le renouvellement du certificat.

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
