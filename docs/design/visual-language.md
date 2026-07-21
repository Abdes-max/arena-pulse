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
| Rôle | Thème clair | Thème sombre |
| --- | --- | --- |
| Primaire | `#1E293B` (encre ardoise) | `#0F172A` |
| Sur primaire | `#FFFFFF` | `#FFFFFF` |
| Accent signal | `#2563EB` → accent vif `#06B6D4` (cyan signal, réservé au direct/actions clés) | `#38BDF8` |
| Fond | `#F8FAFC` | `#0B1220` |
| Carte | `#FFFFFF` | `#141B2E` |
| Bordure | `#E2E8F0` | `#1F2A44` |
| Texte secondaire | `#64748B` | `#94A3B8` |
| Succès / Erreur / Avertissement | `#16A34A` / `#DC2626` / `#D97706` | `#22C55E` / `#EF4444` / `#F59E0B` |

Le cyan signal est la **seule** couleur vive du système — réservée aux badges "En direct", aux CTA principaux et aux indicateurs de changement de score, pour rester lisible et jamais criarde.

### Typographies
- Titres/affichage : **Space Grotesk** (600-700) — caractère technique distinctif.
- Interface/corps : **Inter** (400-600) — excellente lisibilité, chiffres tabulaires natifs, idéal pour scores/classements denses.

### Formes
Angles nets à peine adoucis (rayon 4-6px), grille stricte, séparateurs fins plutôt que des cartes systématiques (cohérent avec mission §19 : "une carte doit représenter une véritable unité fonctionnelle").

### Motifs
Fines lignes de grille en filigrane (évoquant un terrain vu du dessus, très abstraites), jamais figuratives.

### Traitement des scores
Chiffres en Inter Tabular, gros et froids par défaut ; le cyan signal n'apparaît que lors d'un changement récent (ex. score qui vient de bouger), avec une micro-animation de pulsation brève.

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
| Rôle | Thème clair | Thème sombre |
| --- | --- | --- |
| Primaire | `#E4572E` (braise corail) | `#F2703F` |
| Sur primaire | `#FFFFFF` | `#1A0E08` |
| Secondaire/Accent | `#F5B700` (ambre chaleureux) | `#F5C445` |
| Fond | `#FFFBF7` (blanc chaud) | `#1C1410` |
| Carte | `#FFFFFF` | `#261D17` |
| Bordure | `#F0DDD3` | `#3A2A20` |
| Texte secondaire | `#7A6A61` | `#C9B8AD` |
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
| Rôle | Thème clair | Thème sombre |
| --- | --- | --- |
| Primaire | `#6D28D9` (violet profond) | `#7C3AED` |
| Sur primaire | `#FFFFFF` | `#FFFFFF` |
| Accent | `#E11D48` → magenta vif `#F43F5E` (réservé direct/CTA) | `#FB7185` |
| Fond | `#FAF5FF` (blanc violine) | `#0F0F23` |
| Carte | `#FFFFFF` | `#1E1C35` |
| Bordure | `#E9D8FD` | `#322D55` |
| Texte secondaire | `#6B5B95` | `#A78BFA` |
| Succès / Erreur / Avertissement | `#16A34A` / `#DC2626` / `#D97706` | ajustés pour contraste sombre |

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

## Tableau comparatif rapide

| Critère | A. Ink & Signal | B. Pulse Ember | C. Neon Court |
| --- | --- | --- | --- |
| Émotion dominante | Confiance / maîtrise | Chaleur / convivialité | Intensité / modernité |
| Meilleur pour | Administration, données denses | Public familial, moments d'émotion | Phases finales, diaporama, jeune public |
| Risque principal | Trop froid si mal dosé | Trop "marron" en sombre si mal calibré | Accessibilité (contraste) à surveiller |
| Différenciation vs référence | Forte (aucun dashboard sportif ne ressemble à ça) | Forte (évite le cliché rouge/blanc club) | Très forte (aucun concurrent tournoi n'a cette énergie) |

## Recommandation (non contraignante)

Si une seule direction devait être choisie sans hybridation, **Direction A (Ink & Signal)** est recommandée comme base pour sa robustesse sur l'administration dense et sa neutralité multi-sports, avec des **emprunts ponctuels à la Direction C** pour les moments de phase finale/diaporama (traitement le plus spectaculaire). Ceci reste une recommandation, pas une décision : voir la maquette comparative pour trancher visuellement.
