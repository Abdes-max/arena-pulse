# Comptes de test (dev local)

Comptes organisateurs actuellement valides dans la base Postgres locale
(`arena-pulse-postgres-1`, port 5433). Mot de passe identique pour tous :
`a-very-strong-password`.

**Attention** : la suite e2e de `apps/api` (`npm run test:e2e`) tronque
entièrement la base dev à chaque exécution. Voir « Lancer les e2e sans
perdre les données » ci-dessous pour sauvegarder/restaurer autour d'un run.

| Email                              | Mot de passe             | Organisation                | Rôle / usage                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | ------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `demo-1786664015995@example.com`   | `a-very-strong-password` | Demo Data 1786664015995      | Créé via `node infra/scripts/seed-demo-data.mjs` (2026-08-14) — 6 tournois publiés couvrant sports/thèmes/formats différents (Football élimination directe, Basketball championnat poule unique, Handball poules+finale, Volleyball poules seules, Tennis tableau de 16, Rugby multi-catégories). Voir la sortie du script pour les slugs/URLs exacts par tournoi. |
| `demo-1786715828182@example.com`   | `a-very-strong-password` | Demo Data 1786664015995      | Créé via `node infra/scripts/seed-demo-data.mjs` (2026-08-14) — 6 tournois publiés couvrant sports/thèmes/formats différents (Football élimination directe, Basketball championnat poule unique, Handball poules+finale, Volleyball poules seules, Tennis tableau de 16, Rugby multi-catégories). Voir la sortie du script pour les slugs/URLs exacts par tournoi. |

## Lancer les e2e sans perdre les données

La suite e2e (`npm run test:e2e` dans `apps/api`) fait un `TRUNCATE` complet
de la base dev à chaque run. Pour la lancer sans perdre un jeu de données
construit à la main, sauvegarder puis restaurer autour du run :

```bash
# Sauvegarde (depuis la racine du repo, conteneur Postgres démarré)
docker exec arena-pulse-postgres-1 pg_dump -U arena_pulse -d arena_pulse --format=custom -f /tmp/arena_pulse_backup.dump
docker cp arena-pulse-postgres-1:/tmp/arena_pulse_backup.dump ./arena_pulse_backup.dump

# ... lancer npm run test:e2e dans apps/api ...

# Restauration
docker cp ./arena_pulse_backup.dump arena-pulse-postgres-1:/tmp/arena_pulse_backup.dump
docker exec arena-pulse-postgres-1 psql -U arena_pulse -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'arena_pulse' AND pid <> pg_backend_pid();"
docker exec arena-pulse-postgres-1 psql -U arena_pulse -d postgres -c "DROP DATABASE arena_pulse;"
docker exec arena-pulse-postgres-1 psql -U arena_pulse -d postgres -c "CREATE DATABASE arena_pulse OWNER arena_pulse;"
docker exec arena-pulse-postgres-1 pg_restore -U arena_pulse -d arena_pulse /tmp/arena_pulse_backup.dump
```

Sous Git Bash sur Windows, préfixer les commandes `docker exec`/`docker cp`
qui manipulent des chemins commençant par `/tmp/...` avec
`MSYS_NO_PATHCONV=1` pour éviter que Git Bash ne les réinterprète comme des
chemins Windows.

Après restauration, vérifier `npx prisma migrate status` (depuis
`apps/api`) : doit rester "Database schema is up to date!" — sinon la
sauvegarde a été prise sur un schéma différent des migrations actuelles.

## Régénérer depuis zéro (si aucune sauvegarde n'a été prise)

Aucun script de restauration n'est versionné pour ce jeu de données précis
— à recréer à la main via l'UI (inscription organisateur, tournoi,
catégorie, phase de poules + phase finale, équipes, calendrier, scores).
Pour un jeu de données plus riche et scripté, voir les datasets alternatifs
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

### Bug connu (2026-08-14) — `seed-world-cup-2026.ts` plante à la finale

Le script échoue systématiquement dans `playFinalAndThirdPlace` avec
`Cannot read properties of undefined (reading 'homeTeam')` : `matches.find(m
=> m.round === 5 && !m.isThirdPlaceMatch)` renvoie `undefined` juste après
que les deux demi-finales aient été validées (round 4) — le match de finale
(et/ou de petite finale) n'a pas encore été généré côté serveur au moment de
ce `GET`, malgré l'`await` séquentiel sur chaque validation de score. Pas
encore diagnostiqué plus finement (possible incohérence dans
`tryAdvanceRound` spécifique aux brackets `hasRankingMatch: true` de cette
taille, ou une condition de course réelle) — non lié aux changements de
feat/044/feat/045. Le compte `worldcup2026-1786663914835@example.com`
(mot de passe standard) reste en base avec le tournoi jusqu'aux demi-finales
jouées, finale/petite finale non générées/non jouées — utile pour reproduire
le bug, pas pour une démo. Utiliser `seed-demo-data.mjs` en attendant.

## Comptes historiques (obsolètes)

Ces emails apparaissaient dans une version précédente de ce fichier mais ne
correspondent plus à aucun utilisateur en base (perdus lors d'un reset e2e) :
`test-organizer@example.com`, `test-1785497132@example.com`,
`theme-check@example.com`, `theme-verify-1785452564953@example.com`,
`demo-1785497894298@example.com`, `a11y-1785706221073@example.com`,
`demo-1785708404009@example.com`, `worldcup2026-1785708440780@example.com`,
`demo-1785711044713@example.com`, `worldcup2026-1785711069372@example.com`.
