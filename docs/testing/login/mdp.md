# Comptes de test (dev local)

Comptes organisateurs actuellement valides dans la base Postgres locale
(`arena-pulse-postgres-1`, port 5433). Mot de passe identique pour tous :
`a-very-strong-password`.

**Attention** : la suite e2e de `apps/api` (`npm run test:e2e`) tronque
entièrement la base dev à chaque exécution. Ces comptes (et les tournois
associés) disparaissent alors et doivent être recréés — voir la section
« Régénérer » ci-dessous. (Dernier reset : e2e complet lancé pendant les
vérifications de `feat/036-player-registration-and-payments` ; les comptes
`demo-*`/`worldcup2026-*` d'une précédente version de ce fichier ont été
perdus à cette occasion et remplacés par le compte ci-dessous.)

| Email                        | Mot de passe             | Organisation       | Rôle / usage                                                                                                                                          |
| ----------------------------- | ------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `test-organizer@example.com` | `a-very-strong-password` | Organisation Test  | Recréé manuellement après un reset e2e. Tournoi "Tournoi Test" (Football, catégorie Senior) avec une phase de poules (2 groupes de 5 équipes) et une phase finale à élimination directe (tableau de 8, petite finale activée) — pensé pour tester calendrier/scores/tableaux. Une copie ("Tournoi Test (copie)") existe aussi, créée via le bouton Dupliquer. |

## Régénérer après un reset e2e

Aucun script de restauration n'est versionné pour ce jeu de données précis
— à recréer à la main via l'UI (inscription organisateur, tournoi,
catégorie, phase de poules + phase finale, équipes, calendrier). Pour un
jeu de données plus riche et scripté, voir les datasets alternatifs
ci-dessous.

Datasets alternatifs, plus riches, pour une vérification UI générale (créent
une nouvelle organisation + mot de passe aléatoire à chaque exécution —
mettre à jour ce fichier après coup si on veut les retenir) :

```bash
# Dataset varié (6 tournois, sports/thèmes/formats différents)
node infra/scripts/seed-demo-data.mjs

# Coupe du Monde FIFA 2026 (nécessite un build préalable de l'API)
cd apps/api && npm run build && node dist/prisma/seed-world-cup-2026.js
```

## Comptes historiques (obsolètes)

Ces emails apparaissaient dans une version précédente de ce fichier mais ne
correspondent plus à aucun utilisateur en base (perdus lors d'un reset e2e) :
`test-1785497132@example.com`, `theme-check@example.com`,
`theme-verify-1785452564953@example.com`, `demo-1785497894298@example.com`,
`a11y-1785706221073@example.com`, `demo-1785708404009@example.com`,
`worldcup2026-1785708440780@example.com`,
`demo-1785711044713@example.com`, `worldcup2026-1785711069372@example.com`.
