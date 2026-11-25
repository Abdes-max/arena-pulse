// Remembers the team manager's phone on this device, so a registration form
// comes pre-filled the next time (web and app). Kept per category -- a club
// often has a different coach per age group (U11, U14...) -- with the last
// number used as the fallback. Browser storage only; any failure (private
// mode, storage disabled, server side) just means no pre-fill.
const STORAGE_KEY = 'tournarena.managerPhones';

interface StoredPhones {
  last?: string;
  byCategory?: Record<string, string>;
}

function categoryKey(categoryName: string | null | undefined): string | null {
  const key = categoryName?.trim().toLowerCase();
  return key ? key : null;
}

function read(): StoredPhones {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredPhones) : {};
  } catch {
    return {};
  }
}

/** The phone last used for this category, else the last one used at all ('' if none). */
export function recallManagerPhone(categoryName?: string | null): string {
  const stored = read();
  const key = categoryKey(categoryName);
  return (key && stored.byCategory?.[key]) || stored.last || '';
}

/** Saves the phone of a registration that went through. */
export function rememberManagerPhone(categoryName: string | null | undefined, phone: string): void {
  const value = phone.trim();
  if (!value) {
    return;
  }
  const stored = read();
  const key = categoryKey(categoryName);
  const next: StoredPhones = {
    last: value,
    byCategory: key ? { ...stored.byCategory, [key]: value } : stored.byCategory,
  };
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: nothing to remember, the form just won't be pre-filled.
  }
}
