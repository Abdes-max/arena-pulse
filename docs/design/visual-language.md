# Directions artistiques — 3 propositions

Conformément à la mission (§13), voici trois directions artistiques réellement différentes. **Aucune n'est validée.** Chaque palette/typographie ci-dessous est construite à partir de références de design system génériques (base de données interne de styles/couleurs/typographies), jamais copiée de Tournify. Le porteur de projet choisit une direction (ou demande des ajustements) avant toute implémentation d'écran définitif.

**Maquette comparative interactive** (thème clair/sombre × 3 directions, sur un écran type du site public) : voir l'artifact livré avec cette PR — https://claude.ai/code/artifact/d0533817-85a7-48e5-931f-8d5211436a45 (typographies approximées par des piles système ; les polices exactes retenues sont listées ci-dessous par direction et seront implémentées telles quelles dans `feat/004-design-system-foundation`).

---

## Direction A — "Ink & Signal" (précision augmentée)

### Concept

Un centre de contrôle de compétition : fond encre profonde, données organisées avec une rigueur d'instrument de précision, un unique signal électrique qui indique ce qui est vivant/important. Inspiré des tableaux de bord financiers et analytiques premium plutôt que des codes visuels sportifs classiques.

### Émotions recherchées

Confiance, maîtrise, sérieux rassurant, clarté immédiate — l'émotion vient de la précision, pas du bruit visuel.

### Positionnement

Pour l'organisateur qui doit piloter un tournoi complexe (multi-terrains, multi-phases) sans perdre le contrôle, et pour le spectateur qui veut une information fiable, jamais approximative.

### Références visuelles générales

Tableaux de bord fintech/analytics premium, interfaces de contrôle aérien épurées, esthétique "dark cinema" haut de gamme (cf. base de données interne : pairing "Modern Dark Cinema", produits type "Financial Dashboard"/"Analytics Dashboard").

### Couleurs

| Rôle                            | Thème clair                                                                    | Thème sombre                      |
| ------------------------------- | ------------------------------------------------------------------------------ | --------------------------------- |
| Primaire                        | `#1E293B` (encre ardoise)                                                      | `#0F172A`                         |
| Sur primaire                    | `#FFFFFF`                                                                      | `#FFFFFF`                         |
| Accent signal                   | `#2563EB` → accent vif `#06B6D4` (cyan signal, réservé au direct/actions clés) | `#38BDF8`                         |
| Fond                            | `#F8FAFC`                                                                      | `#0B1220`                         |
| Carte                           | `#FFFFFF`                                                                      | `#141B2E`                         |
| Bordure                         | `#E2E8F0`                                                                      | `#1F2A44`                         |
| Texte secondaire                | `#64748B`                                                                      | `#94A3B8`                         |
| Succès / Erreur / Avertissement | `#16A34A` / `#DC2626` / `#D97706`                                              | `#22C55E` / `#EF4444` / `#F59E0B` |

Le cyan signal est la **seule** couleur vive du système — réservée aux badges "En direct", aux CTA principaux et aux indicateurs de changement de score, pour rester lisible et jamais criarde.

### Typographies

- Titres/affichage : **Bricolage Grotesque** (600-700) — grotesque variable au caractère marqué, plus distinctif que les polices d'interface par défaut.
- Interface/corps : **Hanken Grotesk** (400-600) — humaniste, très lisible, chiffres tabulaires natifs, idéal pour scores/classements denses.

### Formes

Angles nets à peine adoucis (rayon 4-6px), grille stricte, séparateurs fins plutôt que des cartes systématiques (cohérent avec mission §19 : "une carte doit représenter une véritable unité fonctionnelle").

### Motifs

Fines lignes de grille en filigrane (évoquant un terrain vu du dessus, très abstraites), jamais figuratives.

### Traitement des scores

Chiffres en Hanken Grotesk Tabular, gros et froids par défaut ; le cyan signal n'apparaît que lors d'un changement récent (ex. score qui vient de bouger), avec une micro-animation de pulsation brève.

### Traitement des classements

Tableaux denses mais très structurés, lignes zébrées discrètes, zone de qualification indiquée par un liseré cyan à gauche de la ligne (pas une couleur de fond qui nuirait à la lisibilité du texte).

### Traitement du direct

Un badge "LIVE" discret mais net (cyan sur fond sombre), pas de rouge clignotant ni d'animation intrusive — la confiance vient de la stabilité, pas de l'agitation.

### Avantages

- Très professionnel, rassure les organisateurs, excellent pour l'administration dense (calendrier, scores).
- Fonctionne nativement en thème sombre (mode "bord de terrain" en plein soleil profite du fort contraste).

### Risques

- Peut sembler froid/moins festif pour le public jeune ou les moments d'émotion forte (victoire, trophée) si on n'introduit pas de moments d'exception.
- Nécessite une discipline forte pour ne pas retomber sur un "dashboard SaaS générique" (mission §11) — la teinte encre doit être distinctive, pas un bleu-gris par défaut.

### Écrans où elle fonctionne particulièrement bien

Administration (calendrier, scores, structure de compétition), classements denses, mode "consultation posée" du site public.

---

## Direction B — "Pulse Ember" (énergie chaleureuse)

### Concept

La chaleur du terrain et l'énergie de la foule, sans tomber dans les codes "club de foot rouge et blanc". Une teinte braise/corail chaude portée par une typographie condensée conçue pour le sport, sur un fond clair et respirant plutôt que sombre.

### Émotions recherchées

Enthousiasme, convivialité, chaleur humaine, sensation de "jour de match" — l'émotion vient de la couleur et du rythme typographique.

### Positionnement

Pour le public (parents, joueurs, spectateurs) qui vit le tournoi comme un moment convivial, pas seulement un flux de données ; pour les moments émotionnels (victoire, qualification, trophée).

### Références visuelles générales

Typographie sportive éditoriale (cf. pairing interne "Sports/Fitness" — Barlow Condensed/Barlow), palettes énergiques chaudes plutôt que le rouge "kit d'équipe" classique.

### Couleurs

| Rôle                            | Thème clair                       | Thème sombre             |
| ------------------------------- | --------------------------------- | ------------------------ |
| Primaire                        | `#E4572E` (braise corail)         | `#F2703F`                |
| Sur primaire                    | `#FFFFFF`                         | `#1A0E08`                |
| Secondaire/Accent               | `#F5B700` (ambre chaleureux)      | `#F5C445`                |
| Fond                            | `#FFFBF7` (blanc chaud)           | `#1C1410`                |
| Carte                           | `#FFFFFF`                         | `#261D17`                |
| Bordure                         | `#F0DDD3`                         | `#3A2A20`                |
| Texte secondaire                | `#7A6A61`                         | `#C9B8AD`                |
| Succès / Erreur / Avertissement | `#2E9E5B` / `#D6432E` / `#F5B700` | idem, ajustés luminosité |

Volontairement **aucun rouge pur ni vert pelouse** en couleur dominante — la braise corail évite la lecture immédiate "maillot d'équipe" tout en gardant l'énergie.

### Typographies

- Titres/scores/affichage : **Barlow Condensed** (600-700), pensée pour le sport — parfaite pour des scores et titres d'affichage impactants sans prendre de place.
- Interface/corps : **Barlow** (400-500) — même famille, cohérence totale entre affichage et lecture.

### Formes

Rayons généreux (10-14px), formes plus organiques, cartes utilisées avec plus de générosité pour un rendu chaleureux (mais toujours fonctionnelles, pas décoratives).

### Motifs

Traits obliques évoquant une trajectoire de balle/ballon (abstrait, jamais un ballon dessiné littéralement), utilisables comme séparateurs de section.

### Traitement des scores

Barlow Condensed en très grande taille sur les cartes de match "à la une", couleur ambre pour le score qui vient de changer, avec un léger rebond (bounce) à l'actualisation.

### Traitement des classements

Lignes de classement avec une bande de couleur pleine (pas juste un liseré) sur la zone de qualification — plus démonstratif que la Direction A, assumé comme plus expressif.

### Traitement du direct

Badge "LIVE" plein, ambre pulsant doucement — le direct est un moment à célébrer visuellement, pas juste à signaler.

### Avantages

- Très chaleureux et accessible, fonctionne bien pour un public familial/associatif (cas d'usage U10 observé dans l'audit).
- Se démarque nettement des codes "rouge club" habituels tout en gardant l'énergie sportive.

### Risques

- Le thème clair chaud peut être moins confortable en usage prolongé de nuit (mode sombre à bien calibrer pour ne pas devenir "marron terne").
- Doit rester crédible pour un usage professionnel (fédération, ligue) et pas seulement "convivial amateur" — l'administration devra garder une hiérarchie visuelle stricte malgré la chaleur de palette.

### Écrans où elle fonctionne particulièrement bien

Accueil public, fiche équipe, moments de célébration (qualification, victoire, trophée), application mobile grand public.

---

## Direction C — "Neon Court" (moderne et compétitif)

### Concept

Une énergie plus contemporaine, proche de l'univers esport/compétition moderne, sans être un clone "gaming RGB". Violet profond + accent rose/magenta, pensée pour un public plus jeune et pour les moments à très forte intensité (phases finales, direct).

### Émotions recherchées

Intensité, modernité, désirabilité, sensation d'un produit "nouvelle génération" plutôt qu'un outil traditionnel de gestion sportive.

### Positionnement

Pour toucher un public plus jeune (esport, sport scolaire/universitaire, futsal, padel) et se différencier fortement des logiciels de gestion sportive "classiques" perçus comme datés.

### Références visuelles générales

Esthétique esport/compétitive premium (cf. pairing interne "Gaming Bold" — Russo One/Chakra Petch), palette violet/rose type produits "Gaming".

### Couleurs

| Rôle                            | Thème clair                                            | Thème sombre                  |
| ------------------------------- | ------------------------------------------------------ | ----------------------------- |
| Primaire                        | `#6D28D9` (violet profond)                             | `#7C3AED`                     |
| Sur primaire                    | `#FFFFFF`                                              | `#FFFFFF`                     |
| Accent                          | `#E11D48` → magenta vif `#F43F5E` (réservé direct/CTA) | `#FB7185`                     |
| Fond                            | `#FAF5FF` (blanc violine)                              | `#0F0F23`                     |
| Carte                           | `#FFFFFF`                                              | `#1E1C35`                     |
| Bordure                         | `#E9D8FD`                                              | `#322D55`                     |
| Texte secondaire                | `#6B5B95`                                              | `#A78BFA`                     |
| Succès / Erreur / Avertissement | `#16A34A` / `#DC2626` / `#D97706`                      | ajustés pour contraste sombre |

### Typographies

- Titres/affichage impact fort (hero, scores de finale) : **Russo One** — utilisé avec parcimonie, uniquement grands titres/scores clés (mission §17 : hiérarchie claire, pas de sur-utilisation d'une police d'impact).
- Interface/corps : **Chakra Petch** (300-600) — légèrement technique mais très lisible, cohérente avec l'univers.

### Formes

Angles taillés (coins coupés/chanfreinés discrets sur les éléments clés type badges), contraste fort entre zones sombres et accents lumineux.

### Motifs

Lignes fines convergentes évoquant un bracket/tableau à élimination (motif directement lié au produit, pas décoratif gratuit), utilisées en arrière-plan très subtil sur les écrans de phase finale.

### Traitement des scores

Russo One en très grand format sur les écrans de phase finale/diaporama uniquement ; Chakra Petch pour tout le reste — évite la fatigue d'une police d'impact partout.

### Traitement des classements

Fond sombre par défaut même en "thème clair produit" pour les écrans de classement final (single dark-surface section assumée), avec dégradé subtil violet→magenta sur la ligne du vainqueur uniquement.

### Traitement du direct

Traitement le plus spectaculaire des 3 directions : halo magenta animé autour du badge "LIVE", pensé pour le mode diaporama (écran de gymnase/stade).

### Avantages

- Direction la plus différenciante et mémorable, forte présence en mode diaporama/affichage public.
- Parle particulièrement bien à un public esport/scolaire/universitaire, aligné avec l'ambition multi-sports de la mission (§12).

### Risques

- Le plus grand risque d'accessibilité des 3 (violet/magenta sur fond sombre exige une vérification de contraste WCAG rigoureuse, notamment pour le texte secondaire).
- Peut sembler too much / trop "gaming" pour un organisateur de tournoi scolaire traditionnel s'il n'est pas assez tempéré en thème clair.

### Écrans où elle fonctionne particulièrement bien

Phases finales/brackets, mode diaporama plein écran, application mobile pour public jeune (esport, universitaire).

---

## Direction D — "Fresh Pitch" (fraîcheur associative)

### Concept

La fraîcheur d'un terrain qui vient d'être tondu et l'énergie du renouveau associatif — un vert organique, jamais un vert "maillot d'équipe" saturé, sur un fond clair et respirant. Là où Pulse Ember porte la chaleur de la foule, Fresh Pitch porte la fraîcheur du terrain lui-même : positivité, croissance, esprit "club local".

### Émotions recherchées

Fraîcheur, vitalité, accessibilité, esprit associatif/grassroots, positivité tranquille — l'émotion vient de la nature du terrain plus que de la foule ou de la compétition.

### Positionnement

Pour les clubs amateurs, tournois scolaires ou associatifs qui veulent une image "nature/durable" sans tomber dans le vert pelouse saturé des kits d'équipe — un vert plus organique et respirant, choisi précisément là où Pulse Ember (§B) avait volontairement évité "aucun vert pelouse en couleur dominante".

### Références visuelles générales

Palettes vertes organiques plutôt que le vert "kit d'équipe" classique, typographie géométrique arrondie contemporaine évoquant la croissance/le renouveau.

### Couleurs

| Rôle                            | Thème clair                                | Thème sombre                      |
| ------------------------------- | ------------------------------------------ | --------------------------------- |
| Primaire                        | `#15803D` (vert forêt)                     | `#4ADE80`                         |
| Sur primaire                    | `#FFFFFF`                                  | `#0D1A12`                         |
| Accent signal                   | `#EA9A1A` (or chaud, "soleil sur l'herbe") | `#FBBF24`                         |
| Fond                            | `#F6FBF6` (blanc menthé)                   | `#0D1A12`                         |
| Carte                           | `#FFFFFF`                                  | `#16261B`                         |
| Bordure                         | `#DBE9DE`                                  | `#223A2B`                         |
| Texte secondaire                | `#5F7768`                                  | `#9DC0AB`                         |
| Succès / Erreur / Avertissement | `#16A34A` / `#DC2626` / `#A35905`          | `#4ADE80` / `#F87171` / `#FBBF24` |

Le vert primaire est délibérément _distinct_ du vert "victoire/qualification" (`--ap-color-win`, réutilisé de la Direction A) — même famille de teinte, mais un ton différent pour qu'un badge de qualification ne se fonde pas dans l'interface courante colorée par la marque.

### Typographies

- Titres/affichage : **Outfit** (600-700) — géométrique, arrondie, contemporaine, évoque la croissance sans tomber dans le décoratif.
- Interface/corps : **Manrope** (400-600) — humaniste, très lisible, chiffres tabulaires natifs.

### Formes

Rayons généreux mais mesurés (8-16px), entre la précision d'Ink & Signal et la rondeur de Pulse Ember — une forme "cultivée", pas anguleuse ni débordante.

### Motifs

Lignes de tonte évoquant les bandes d'un terrain fraîchement entretenu (abstrait, jamais un brin d'herbe dessiné), utilisables en séparateur de section.

### Traitement des scores

Chiffres en Manrope tabulaire, l'or chaud du signal apparaît sur un score qui vient de changer — un clin d'œil discret plutôt qu'une célébration bruyante.

### Traitement des classements

Bande de qualification en vert "win" (Direction A), distincte du vert primaire de la marque — lisible immédiatement comme "résultat sportif", pas comme un simple élément d'interface.

### Traitement du direct

Badge "LIVE" sobre, or chaud pulsant doucement — cohérent avec l'esprit "club local" plutôt que spectaculaire.

### Avantages

- Couvre un segment de marque (clubs/associations à image "nature/durable") qu'aucune des 3 premières directions n'adressait directement.
- Le vert reste immédiatement lisible comme "positif/croissance" sans dupliquer le cliché du maillot d'équipe.

### Risques

- Deux verts dans la même palette (marque + victoire) exige une discipline de conception pour rester distincts (voir note ci-dessus) — même risque que Neon Court avec violet/magenta, mais moins sévère en pratique (les deux verts sont proches en teinte, pas en nature).
- Peut sembler trop proche de Pulse Ember en photo d'ensemble si les deux ne sont jamais vus côte à côte — leur différenciation réelle est la fraîcheur (vert/clair) contre la chaleur (corail/chaud), pas la structure.

### Écrans où elle fonctionne particulièrement bien

Accueil public de clubs amateurs/associatifs, tournois scolaires en extérieur, structures multi-terrains engazonnés.

---

## Direction E — "Crimson Charge" (intensité classique)

### Concept

L'intensité classique de la compétition — ligne de départ, carton, drapeau à damier — un rouge affirmé et immédiat. Là où Neon Court vise un public jeune esport avec du violet/magenta, Crimson Charge assume une énergie de compétition plus traditionnelle et universelle, sans tomber dans le rouge "kit d'équipe" pur : un rouge profond (bordeaux/cramoisi) pour la marque, distinct du rouge vif réservé au statut d'erreur.

### Émotions recherchées

Intensité, assurance, tradition compétitive, immédiateté — l'émotion vient de la franchise de la couleur, pas de sa nouveauté.

### Positionnement

Pour les organisateurs qui veulent une identité de tournoi franche et mémorable, dans la lignée visuelle classique du sport de compétition (athlétisme, sports de combat, ligues historiques) plutôt que l'esthétique "nouvelle génération" de Neon Court.

### Références visuelles générales

Typographie d'impact façon affiche de compétition classique, rouge profond plutôt que le rouge vif "maillot" — cf. la même discipline déjà appliquée par Pulse Ember à l'orange/corail.

### Couleurs

| Rôle                            | Thème clair                                                 | Thème sombre                      |
| ------------------------------- | ----------------------------------------------------------- | --------------------------------- |
| Primaire                        | `#9F1239` (cramoisi profond)                                | `#F43F5E`                         |
| Sur primaire                    | `#FFFFFF`                                                   | `#1A0E0E`                         |
| Accent signal                   | `#EAB308` (or, duo classique "rouge + or" trophée/médaille) | `#FBBF24`                         |
| Fond                            | `#FFF8F7` (blanc chaud)                                     | `#1A0E0E`                         |
| Carte                           | `#FFFFFF`                                                   | `#2A1615`                         |
| Bordure                         | `#F3DCD9`                                                   | `#40201D`                         |
| Texte secondaire                | `#8A6360`                                                   | `#D1A6A0`                         |
| Succès / Erreur / Avertissement | `#16A34A` / `#DC2626` / `#A35905`                           | `#4ADE80` / `#FF6B6B` / `#FBBF24` |

Le cramoisi profond de la marque (`--ap-color-primary`) est délibérément distinct du rouge vif réservé au statut d'erreur (`--ap-color-error`, `#DC2626`) — sans cette distinction, un bouton stylé à la couleur de marque et un état d'erreur deviendraient visuellement identiques. Même discipline que Neon Court pour son propre risque violet/magenta (§C), appliquée ici au rouge.

### Typographies

- Titres/affichage impact fort : **Anton** — très condensée et massive, utilisée avec parcimonie (grands titres, scores de finale), dans l'esprit des affiches de compétition classiques.
- Interface/corps : **Work Sans** (400-600) — neutre, très lisible, ne rivalise jamais avec Anton en titre.

### Formes

Angles nets et assurés (rayon 4-8px), plus proches d'Ink & Signal que de la rondeur de Pulse Ember — une franchise formelle qui accompagne la franchise de couleur.

### Motifs

Lignes obliques évoquant une ligne d'arrivée ou un couloir de piste (abstrait), utilisables comme séparateurs de section — écho volontaire aux "traits obliques" de Pulse Ember, mais plus tendus/assertifs.

### Traitement des scores

Anton en très grand format sur les cartes de match "à la une" ; l'or du signal marque un score qui vient de changer, avec un temps de pause net plutôt qu'un rebond.

### Traitement des classements

Bande de qualification pleine, dans le même esprit démonstratif que Pulse Ember, mais en cramoisi — jamais dans le rouge d'erreur.

### Traitement du direct

Badge "LIVE" plein cramoisi, sans animation agressive — l'intensité vient de l'assurance de la couleur, pas d'un clignotement.

### Avantages

- Couvre un registre "compétition classique/franche" qu'aucune des 4 autres directions n'adresse — Neon Court est futuriste, Pulse Ember est chaleureux, ni l'un ni l'autre n'est "sérieusement compétitif" au sens traditionnel.
- Duo rouge profond + or reste immédiatement lisible comme "trophée/médaille", un registre émotionnel fort et universel.

### Risques

- Risque de confusion marque/erreur si la distinction cramoisi/rouge-vif n'est pas maintenue avec rigueur dans chaque nouveau composant — à vérifier systématiquement (même vigilance que Neon Court pour le violet/magenta).
- Le rouge reste la couleur la plus associée aux "kits d'équipe" dans le sport amateur ; le choix d'un cramoisi profond plutôt qu'un rouge vif est ce qui évite ce cliché, mais exige une discipline constante pour ne jamais glisser vers un rouge plus saturé "par défaut".

### Écrans où elle fonctionne particulièrement bien

Tournois de sports de combat/athlétisme, ligues à image traditionnelle/historique, moments de célébration (podium, médaille).

---

## Tableau comparatif rapide

| Critère                      | A. Ink & Signal                                   | B. Pulse Ember                           | C. Neon Court                                           | D. Fresh Pitch                                          | E. Crimson Charge                                             |
| ---------------------------- | ------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| Émotion dominante            | Confiance / maîtrise                              | Chaleur / convivialité                   | Intensité / modernité                                   | Fraîcheur / renouveau                                   | Intensité / tradition                                         |
| Meilleur pour                | Administration, données denses                    | Public familial, moments d'émotion       | Phases finales, diaporama, jeune public                 | Clubs associatifs, tournois scolaires en extérieur      | Sports de combat/athlétisme, ligues traditionnelles           |
| Risque principal             | Trop froid si mal dosé                            | Trop "marron" en sombre si mal calibré   | Accessibilité (contraste) à surveiller                  | Proximité perçue avec Pulse Ember en photo isolée       | Confusion marque/erreur (rouge/rouge) si mal disciplinée      |
| Différenciation vs référence | Forte (aucun dashboard sportif ne ressemble à ça) | Forte (évite le cliché rouge/blanc club) | Très forte (aucun concurrent tournoi n'a cette énergie) | Forte (évite le vert pelouse saturé que B évitait déjà) | Forte (évite le rouge vif "kit club" par un cramoisi profond) |

## Décision validée : les 5 directions sont conservées, à des rôles différents

Après revue de la maquette comparative initiale (3 directions), le porteur de projet a choisi de **conserver les directions**, mais pas comme un choix exclusif : elles jouent deux rôles distincts dans le produit. Deux directions supplémentaires (D · Fresh Pitch, E · Crimson Charge) ont été ajoutées ultérieurement, sur demande explicite d'élargir la palette disponible aux organisateurs avec une option verte et une option rouge — exactement l'extensibilité que ce document anticipait dès l'origine (voir plus bas).

1. **Identité produit Arena Pulse (fixe)** — l'administration (console de gestion) et le site marketing du produit utilisent **Direction A · Ink & Signal** comme identité unique et stable, quel que soit le tournoi consulté. Choix justifié par sa robustesse sur les écrans denses (calendrier, scores, structure de compétition) et sa neutralité multi-sports.
2. **Thème visuel du tournoi (au choix de l'organisateur)** — chaque organisateur choisit, pour **son** tournoi, l'une des 5 directions (A à E) comme thème appliqué au **site public de ce tournoi et à son mode diaporama**. L'administration et l'application mobile de suivi restent toujours dans l'identité Arena Pulse standard (Direction A), quel que soit le thème public choisi par l'organisateur — décision explicite pour garder une seule identité produit cohérente en interne, tout en offrant une vraie personnalisation aux organisateurs (mission §2 : "plus personnalisable").

Cette approche est elle-même une différenciation par rapport à la référence : l'audit admin a repéré un onglet "Design" dans l'écran Présentation de Tournify sans l'ouvrir (`docs/product/screen-inventory.md`, écran A7) — la personnalisation visuelle par tournoi existe donc potentiellement déjà côté référence sous une forme non confirmée, mais Arena Pulse en fait une caractéristique assumée et documentée dès la conception, avec des directions complètes plutôt qu'un réglage superficiel.

### Conséquences de conception (à documenter/implémenter dans les PR suivantes)

- `docs/architecture/data-model.md` : `PublicPageConfiguration` porte un champ `theme` (`INK_SIGNAL` / `PULSE_EMBER` / `NEON_COURT` / `FRESH_PITCH` / `CRIMSON_CHARGE`, extensible), qui pilote le rendu du site public et du diaporama de ce tournoi uniquement.
- Le design system (`feat/004-design-system-foundation`) doit livrer des **jeux de tokens complets dès le départ** pour chaque direction (pas un seul), plus l'identité fixe de l'administration — pas une simple palette de secours.
- Chaque composant public (cf. `component-inventory.md`) doit être conçu pour consommer des tokens de thème variables, jamais des couleurs codées en dur.
- Un thème supplémentaire pourra être ajouté ultérieurement sans changement de modèle (juste une nouvelle valeur d'énumération + un nouveau jeu de tokens) — extensibilité déjà prévue et déjà exercée une fois (D et E, ajoutées après les 3 directions d'origine).

### Point non tranché

Le porteur de projet a explicitement choisi de limiter le thème au site public + diaporama pour la V1 (pas l'application mobile, pas l'administration du tournoi lui-même) — une extension du thème à l'app mobile ou à l'admin du tournoi reste une évolution future possible, à documenter dans `assumptions-and-open-questions.md` si elle est envisagée.
