// Age categories offered by the quick event form (youth "U" categories as
// used by French football clubs, then adults). Stored as the category's
// name, so they read the same on every public page.
export const AGE_CATEGORIES = [
  'U5',
  'U6',
  'U7',
  'U8',
  'U9',
  'U10',
  'U11',
  'U12',
  'U13',
  'U14',
  'U15',
  'U16',
  'U17',
  'U18',
  'U19',
  'U20',
  'Senior',
  'Vétéran',
] as const;

export type AgeCategory = (typeof AGE_CATEGORIES)[number];
