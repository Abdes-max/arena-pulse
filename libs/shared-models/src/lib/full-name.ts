// One « Prénom et nom » field on the sign-up forms (web and app), while the
// API keeps firstName / lastName: the first word is the first name, the rest
// the last name ("Jean-Marc De La Tour" -> "Jean-Marc" / "De La Tour").
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const [firstName = '', ...rest] = fullName.trim().split(/\s+/);
  return { firstName, lastName: rest.join(' ') };
}

/** Both parts present -- a single word can't fill the API's lastName. */
export function isCompleteFullName(fullName: string): boolean {
  const { firstName, lastName } = splitFullName(fullName);
  return !!firstName && !!lastName;
}
