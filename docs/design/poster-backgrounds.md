# Fonds d'affiche par sport

Le générateur d'affiche (`apps/web/src/app/admin/shared/event-poster/`) pose ses textes sur une photo de fond choisie selon le sport du tournoi :

```
apps/web/public/poster-backgrounds/<sport>.jpg
```

`<sport>` est le nom du sport en minuscules et sans accents : `football`, `futsal`, `basketball`, `handball`, `volleyball`, `rugby`, `tennis`, `padel`, `badminton`, `esport`. Tant qu'un fichier manque, l'affiche reprend `football.jpg` très fortement floutée : on n'en garde que les couleurs et les lumières, sans pouvoir deviner qu'il s'agit de football.

## Contraintes communes (à respecter pour chaque image)

La mise en page et le recoloriage selon le thème ont été réglés sur `football.jpg`. Une nouvelle image doit reprendre le même cadrage.

- **Format** : portrait 2:3, 1024 × 1536 px (ou un multiple), en JPEG qualité ~85, moins de 600 Ko.
- **Haut (0 à 25 %)** : ciel nocturne ou plafond sombre, quasi vide, avec des projecteurs dans les deux coins hauts. Le titre s'y pose.
- **Deux joueurs** de 10 à 12 ans, en action :
  - l'un dans le tiers gauche, l'autre dans le tiers droit, tournés vers le centre ;
  - la tête vers 27 % de la hauteur, les pieds vers 60-63 %.
- **Centre libre** : un espace vide entre les deux joueurs, à hauteur de poitrine, pour le logo du club.
- **Bas (60 à 100 %)** : la surface de jeu, éclairée d'une lumière dorée. Les cartes d'infos s'y posent.
- **Tribunes** : pleines de supporters sur les côtés, avec des drapeaux et banderoles **vert et jaune**.
- **Couleurs** :
  - **Maillots vert foncé avec liserés jaunes.** Ce vert et ce jaune sont recolorés aux couleurs du thème du tournoi.
  - **Aucune autre surface vert franc** (sol, murs, panneaux), sinon elle serait recolorée aussi. Une pelouse vert-jaune comme au football reste intacte.
- **À éviter** : texte, logo, marque (pas de virgule Nike), numéros lisibles.
- **Style** : photoréaliste, cinématographique, contrasté, paillettes et poussière dorées dans la lumière.

## Prompts

Chaque prompt commence par ce bloc commun, suivi de la partie propre au sport :

> Photorealistic cinematic sports poster background, vertical 2:3 (1024x1536). Night match atmosphere, dark sky in the top quarter with bright stadium floodlights in both top corners. Two kids aged 10-12 in dark green kits with yellow trims, one on the left third and one on the right third, both facing the center in dynamic action, heads at about 27% of the height, feet at about 62%. Empty space in the center between them at chest height. Packed stands on both sides with fans waving green and yellow flags and banners. Golden light, sparkles and dust in the air. No text, no logos, no brand marks, no readable numbers.

| Sport      | Fichier          | Partie propre au sport                                                                                                                                                                                                                                  |
| ---------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Futsal     | `futsal.jpg`     | Indoor futsal arena, polished blue-and-orange court with white lines, small futsal ball at the left player's feet, small futsal goal far in the background center.                                                                                      |
| Basketball | `basketball.jpg` | Indoor basketball arena, warm hardwood court, left player dribbling a basketball, right player defending, hoop and backboard small in the far background center, scoreboard glow above.                                                                 |
| Handball   | `handball.jpg`   | Indoor handball arena, orange-and-blue court, left player holding a handball ready to throw, right player blocking, handball goal far in the background center.                                                                                         |
| Volleyball | `volleyball.jpg` | Indoor volleyball arena, orange court, net running low across the far background, left player jumping to spike a volleyball, right player jumping to block.                                                                                             |
| Rugby      | `rugby.jpg`      | Outdoor rugby stadium at night, yellow-green grass, left player running with an oval rugby ball, right player diving to tackle, H-shaped goal posts far in the background center.                                                                       |
| Tennis     | `tennis.jpg`     | Night tennis court, blue hard court (not green), left player hitting a forehand, right player running to the ball, net and umpire chair far in the background center.                                                                                   |
| Padel      | `padel.jpg`      | Padel court with glass walls and blue artificial turf (not green), left player smashing with a padel racket, right player ready at the glass, net in the background center.                                                                             |
| Badminton  | `badminton.jpg`  | Indoor badminton hall, wooden floor with white lines, left player jumping for a smash with a racket, shuttlecock in the air, right player lunging, net in the background center.                                                                        |
| Esport     | `esport.jpg`     | Esports arena stage, two young gamers in dark green team jerseys with yellow trims, seated at gaming setups on the left and right facing the center, headsets on, giant screens and LED light beams behind, cheering crowd with green and yellow flags. |

## Ajouter une image

1. Générer l'image avec le prompt et vérifier le cadrage :
   - les têtes sont sous la date, les pieds juste au-dessus du bandeau « Informations générales » ;
   - le centre reste libre pour le logo.
2. L'exporter en JPEG 1024 × 1536 sous `apps/web/public/poster-backgrounds/<sport>.jpg`.
3. Vérifier l'affiche d'un tournoi de ce sport sur plusieurs thèmes : seuls les maillots et les drapeaux doivent changer de couleur.
