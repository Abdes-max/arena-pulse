# Principes de design

Ces principes s'appliquent quelle que soit la direction artistique retenue (`visual-language.md`).

1. **Une carte = une unité fonctionnelle réelle.** Ne pas envelopper chaque bloc d'information dans une carte par réflexe (mission §19). Un séparateur, un espacement ou une typographie suffisent souvent.
2. **La couleur informe, jamais seule.** Toute information portée par une couleur (statut de match, zone de qualification, victoire/défaite) doit être doublée d'un texte, d'une icône ou d'une forme — jamais de la couleur seule (mission §16, WCAG).
3. **Un composant par contexte de match.** Pas de carte de match unique pour tous les cas (mission §20) : featured match, live match card, upcoming, result, compact row, bracket match, team match card sont des composants distincts, pas des variantes de style d'un même composant générique.
4. **Les données denses restent lisibles avant d'être belles.** Sur les écrans d'administration et de classement, la lisibilité et le scan rapide priment sur l'expressivité — l'expressivité se concentre sur les écrans publics et les moments d'émotion.
5. **Les moments d'émotion sont délibérément mis en scène.** Lancement du tournoi, passage en direct, score marqué, qualification, victoire, trophée : ces instants méritent une animation et un traitement visuel distincts du reste de l'interface (mission §23), sans jamais bloquer l'utilisateur.
6. **Cohérence stricte entre web et mobile**, pas identité entre les deux. Les tokens (couleurs, typographie, espacement) sont partagés ; les composants s'adaptent aux conventions natives de chaque plateforme (mission §22, §27).
7. **Sportivement neutre par défaut.** Aucun composant ne doit supposer un seul sport (ex. terminologie, iconographie, proportions de terrain) — les couleurs d'équipe/logos réels apportent la couleur sportive, pas le système lui-même (mission §12).
8. **Rien n'est validé avant confirmation explicite** sur les décisions difficilement réversibles (direction artistique, logo définitif) — cf. mission §4 et §13.
