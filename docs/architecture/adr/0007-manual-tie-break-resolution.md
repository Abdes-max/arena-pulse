# ADR 0007 — Départage manuel des égalités totales (poule et inter-poules)

## Statut

Accepté — `feat/066-tie-break-and-schedule-ux`.

## Contexte

`StandingRule.tieBreakOrder` (ADR implicite du modèle de données initial, `docs/architecture/data-model.md`)
laisse l'organisateur configurer l'ordre des critères de départage (points → différence de buts →
buts marqués → confrontation directe). `standings.util.ts` (`resolveOrder`) applique ces critères
récursivement ; si tous sont épuisés et que des équipes restent à égalité, la fonction retombait sur
un **tri alphabétique par nom d'équipe** — un critère purement technique, jamais choisi ni même vu
par l'organisateur.

Cette égalité résiduelle n'est pas seulement cosmétique : `BracketsService.resolveQualificationSlots`
lit directement la position des équipes dans le classement pour nommer les équipes d'un tableau à
élimination directe ("1er Poule A" devient l'équipe réellement classée 1ère). Une égalité totale
tranchée alphabétiquement pouvait donc **nommer silencieusement une équipe qualifiée** (ou
attribuer un seed 1 plutôt que 2) sans qu'aucune décision réelle n'ait été prise — remonté en test
manuel par le porteur de projet, aussi bien au sein d'une poule qu'entre poules (règle
`CrossGroupQualificationRule`, ex. "2 meilleurs 3èmes").

Options envisagées :

1. Départage automatique supplémentaire (ex. discipline/cartons, tirage au sort horodaté) — écarté :
   aucune donnée de discipline n'existe dans le modèle actuel, et un tirage au sort silencieux a
   exactement le même défaut que l'alphabétique (une décision invisible).
2. Bloquer la génération du calendrier tant qu'une égalité affectant une qualification n'est pas
   tranchée — écarté par le porteur de projet (question de clarification explicite) : trop rigide,
   un organisateur doit pouvoir préparer son tableau avant que toutes les poules soient jouées.
3. **Choix retenu** : réutiliser le repli alphabétique comme valeur par défaut non bloquante, mais
   l'exposer explicitement et permettre à l'organisateur de le remplacer manuellement, poule par
   poule et règle inter-poules par règle inter-poules.

## Décision

1. **`resolveOrder` (standings.util) gagne un paramètre optionnel `manualOrder: string[]`**, consulté
   comme tout dernier critère avant le repli alphabétique — liste d'identifiants d'équipe dans
   l'ordre de préférence de l'organisateur. Paramètre à valeur par défaut `[]` : aucun appel
   existant (`computeStandings`, `rankCrossGroupCandidates`) n'est cassé par ce changement.
2. **`findUnresolvedTies`** (nouvelle fonction, même fichier) rejoue la même récursion en lecture
   seule pour identifier les groupes de 2+ équipes encore à égalité une fois tous les critères (et
   l'ordre manuel déjà posé) épuisés — utilisée à la fois pour l'affichage (page Classement) et pour
   la décision de retenir ou non une équipe dans `resolveQualificationSlots`.
3. **Persistance par append, pas par remplacement** : `StandingRule.manualTieBreakOrder` (poule) et
   `CrossGroupQualificationRule.manualTieBreakOrder` (règle inter-poules) sont des `TEXT[]` — chaque
   décision de l'organisateur ("cette équipe passe devant les autres pour l'instant") ajoute un
   identifiant à la fin de la liste. Une égalité à 3+ équipes se résout ainsi un choix à la fois,
   sans qu'un unique écran doive proposer un classement complet de N équipes en une fois.
4. **`resolveQualificationSlots` (BracketsService) retient l'équipe** (`teamId: null`, libellé
   espace réservé conservé) pour toute position couverte par une égalité non résolue — même
   traitement qu'une poule pas encore terminée, réutilisant l'infrastructure d'espace réservé déjà en
   place (`homeSourceLabel`/`awaySourceLabel`, `feat/065` et travaux précédents de cette session).
5. **Pas de blocage de la génération** : le repli alphabétique reste utilisé si l'organisateur n'a
   rien tranché — modifiable après coup, y compris après une génération déjà faite (les matchs déjà
   créés restent inchangés tant qu'une revalidation de score ou une résolution manuelle ne les
   retouche pas via `tryResolveFirstRound`).
6. **Toute égalité totale est concernée, pas seulement la frontière de qualification** — y compris
   entre deux équipes qui se qualifient toutes les deux (ex. 1ère vs 2ème de poule), car l'ordre
   exact influence le seed attribué dans le tableau. Décision explicite du porteur de projet
   (clarification demandée en amont), plus large que le minimum "qui passe / qui ne passe pas".
7. **Interface organisateur uniquement** : le sélecteur de départage vit sur la page Classement
   (admin), jamais côté public — le site public affiche l'absence de badge "Qualifié" sur les
   équipes concernées sans explication, cohérent avec le principe déjà établi de ne jamais exposer
   de mécanique de gestion interne sur le site visiteur.

## Justification

- Réutiliser le repli alphabétique comme *valeur par défaut* (plutôt que le remplacer par un blocage
  ou un tirage au sort) évite de complexifier `resolveOrder` avec un nouvel état "en attente" tant
  que rien n'a besoin d'être décidé — la fonction reste pure et déterministe dans tous les cas.
- L'append plutôt que le remplacement complet correspond exactement à l'interaction demandée ("un
  petit message avec une select-menu") : l'organisateur choisit une équipe à la fois parmi les
  équipes encore à égalité, jamais un ordre complet à construire d'un coup.
- Traiter une égalité non résolue exactement comme "poule incomplète" dans
  `resolveQualificationSlots` évite un troisième état à gérer côté Calendrier/Score/Classement — ces
  écrans savent déjà afficher un espace réservé (`homeSourceLabel`/`awaySourceLabel`) et ignorent la
  raison exacte pour laquelle l'équipe réelle n'est pas encore connue.

## Conséquences

- **Deux nouveaux endpoints par contexte** (poule : `POST`/`DELETE
  .../groups/:groupId/tie-break-choice` ; règle inter-poules : `POST`/`DELETE
  .../cross-group-qualification-rules/:ruleId/tie-break-choice`), suivant les mêmes gardes
  d'autorisation (`ORG_MEMBER`) que la saisie de score — aucun rôle dédié introduit.
- **`getStandings`/`getGroupQualifications` changent de forme de réponse** :
  `StandingsResult.unresolvedTies` est un nouveau champ non optionnel (`libs/shared-models`,
  `Standings.unresolvedTies`) — tout consommateur TypeScript existant du type `Standings` doit
  fournir ce champ (impact confiné aux fixtures de test, corrigé dans cette même PR).
- **Résoudre une égalité redéclenche `tryResolveFirstRound`** depuis les contrôleurs (pas les
  services, pour éviter une dépendance circulaire `StandingsService` ↔ `BracketsService`) — un choix
  de départage peut donc immédiatement faire apparaître les vraies équipes d'un 1er tour déjà
  généré, sans attendre la prochaine validation de score.
- **Aucune interface de résolution côté mobile** — l'app mobile reçoit `unresolvedTies` via le même
  contrat API mais ne l'exploite pas encore ; hors périmètre de cette itération.

## Réversibilité

`manualOrder` est un paramètre additif de `resolveOrder`/`findUnresolvedTies` (valeur par défaut
`[]`) : revenir au comportement précédent (repli alphabétique pur, jamais modifiable) reviendrait à
ignorer `manualTieBreakOrder` en base sans avoir à toucher la logique de tri elle-même. Les deux
colonnes `manualTieBreakOrder` sont indépendantes de tout autre modèle et peuvent être vidées
(`DELETE .../tie-break-choice`) ou supprimées sans effet de bord sur `tieBreakOrder`,
`QualificationRule` ou `CrossGroupQualificationRule` (hors `manualTieBreakOrder` lui-même).
