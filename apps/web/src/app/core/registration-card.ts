import { PublicTournamentDirectoryItem } from 'shared-models';

/** "Inscriptions ouvertes (10/12)" + "40 €" for a search card; nulls when not taking registrations. */
export function registrationCard(
  item: PublicTournamentDirectoryItem,
  translate: (key: string, params?: Record<string, unknown>) => string,
  lang: string,
): { label: string | null; price: string | null } {
  const registration = item.registration;
  if (!registration) {
    return { label: null, price: null };
  }
  const full = registration.total !== null && registration.taken >= registration.total;
  const label = full
    ? translate('registrationCard.full')
    : registration.total !== null
      ? translate('registrationCard.open', { taken: registration.taken, total: registration.total })
      : translate('registrationCard.openNoLimit');
  const price =
    registration.feeCents !== null
      ? new Intl.NumberFormat(lang, { style: 'currency', currency: registration.currency }).format(
          registration.feeCents / 100,
        )
      : null;
  return { label, price };
}
