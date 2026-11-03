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
- Un fournisseur SMTP transactionnel (Brevo par défaut : `smtp-relay.brevo.com`, port 587
  STARTTLS — créer une clé SMTP dédiée dans Brevo, et vérifier le domaine `DOMAIN` côté Brevo
  pour le SPF/DKIM) — voir `SMTP_*` dans `.env.example`.

## Déployer

```bash
# Depuis la racine du dépôt, sur l'hôte cible :
git clone <ce dépôt> && cd arena-pulse
cp infra/deployment/.env.example infra/deployment/.env
# Éditer infra/deployment/.env : POSTGRES_PASSWORD, JWT_SECRET (openssl rand -base64 48),
# DOMAIN, WEB_PUBLIC_ORIGIN, SMTP_HOST/PORT/USER/PASSWORD/FROM au minimum.

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

Le service `migrate` s'exécute avant `api` à chaque `up`, applique les migrations Prisma en
attente puis peuple/rafraîchit les données de référence (sports, permissions — idempotent, sans
effet si déjà à jour) ; `api` ne démarre que si `migrate` s'est terminé avec succès.

## Déployer en continu (GitHub Actions)

Le workflow `.github/workflows/deploy-prod.yml` reproduit la section
"Mettre à jour" ci-dessus par SSH, déclenché manuellement ("Run workflow"
depuis l'onglet Actions du dépôt — un clic).

Prérequis, à faire une seule fois :

1. **Sur le VPS**, cloner le dépôt et le configurer comme dans "Déployer"
   ci-dessus (`git clone`, `.env` rempli). Le clone doit être dédié au
   déploiement : le workflow fait `git reset --hard origin/master`, donc
   toute modification locale sur ce clone serait écrasée au prochain
   déploiement.
2. Créer une paire de clés SSH dédiée
   (`ssh-keygen -t ed25519 -C "deploy@arena-pulse" -f deploy_key -N ""`) et
   ajouter la **clé publique** à `~/.ssh/authorized_keys` de l'utilisateur
   SSH sur le VPS.
3. Dans les settings GitHub du dépôt (Settings → Secrets and variables →
   Actions), ajouter :
   - `DEPLOY_HOST` — IP ou nom d'hôte du VPS
   - `DEPLOY_USER` — utilisateur SSH (éviter `root` si possible)
   - `DEPLOY_SSH_KEY` — la **clé privée** générée à l'étape 2
   - `DEPLOY_PATH` — chemin absolu du clone sur le VPS (ex. `/opt/arena-pulse`)
   - `DEPLOY_PORT` — optionnel, si le SSH du VPS n'écoute pas sur 22
4. Optionnel mais recommandé : créer un environment GitHub `production`
   (Settings → Environments) avec des "required reviewers", pour qu'un
   déploiement demande une validation humaine avant de s'exécuter.

## Sauvegarder

Les données PostgreSQL vivent dans le volume nommé `arena-pulse-postgres-prod` (déclaré dans
`docker-compose.prod.yml`) — sauvegarder ce volume (ou faire des dumps réguliers via
`docker compose exec postgres pg_dump ...`) selon la politique de sauvegarde de l'hôte choisi ;
rien n'est automatisé ici.
