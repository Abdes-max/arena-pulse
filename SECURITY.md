# Politique de sécurité

## Signaler une vulnérabilité

Si vous découvrez une vulnérabilité de sécurité dans Arena Pulse, merci de ne **pas** ouvrir d'issue publique. Contactez directement le porteur de projet.

## Périmètre

Arena Pulse gère des données de tournois sportifs (équipes, joueurs, organisateurs, arbitres) et des comptes utilisateurs. Sont notamment concernés :
- Authentification et gestion de session.
- Isolation des données entre organisations et entre tournois.
- Permissions granulaires par tournoi (voir `docs/product/roles-and-permissions.md`).
- Protection des données personnelles (RGPD) — joueurs mineurs potentiellement concernés (contexte U10/U14 observé dans les données de démonstration).

## Engagements de conception (cf. mission)

- Contrôle d'accès systématiquement vérifié côté serveur (jamais uniquement côté client).
- Validation stricte des entrées (DTOs `class-validator` côté API NestJS).
- Secrets et identifiants de connexion **jamais** commités dans le dépôt — voir `.env.example` pour la liste des variables attendues, à renseigner localement dans un `.env` non versionné.
- Dépendances suivies et mises à jour (`npm audit` intégré à la CI dès que celle-ci existe).
- Messages d'erreur ne divulguant jamais d'information technique sensible (traces de pile, requêtes SQL) aux utilisateurs finaux.

## Versions supportées

Projet en phase de fondation — pas encore de version publiée. Cette section sera complétée à la première mise en production.
