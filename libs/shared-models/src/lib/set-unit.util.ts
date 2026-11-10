/**
 * What is counted inside a set, to label the "difference" column of a sets
 * sport's standings: tennis and padel count games, volleyball and badminton
 * count points.
 */
export function setUnitForSport(sportName: string): 'games' | 'points' {
  const name = sportName.trim().toLowerCase();
  return name === 'tennis' || name === 'padel' ? 'games' : 'points';
}
