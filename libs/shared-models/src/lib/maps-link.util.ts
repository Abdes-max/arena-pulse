export type MapsPlatform = 'ios' | 'android' | 'desktop';

/** Which navigation app a "lieu" link should hand over to, from the user agent. */
export function detectMapsPlatform(userAgent: string, maxTouchPoints = 0): MapsPlatform {
  // iPadOS reports a desktop Safari UA -- touch support gives it away.
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/Android/i.test(userAgent)) {
    return 'android';
  }
  return 'desktop';
}

/** What to search for: the full address when known, prefixed by the venue's own name. */
export function venueMapsQuery(venue: { name: string; address: string | null }): string {
  const address = venue.address?.trim();
  if (!address) {
    return venue.name;
  }
  return address.toLowerCase().includes(venue.name.trim().toLowerCase())
    ? address
    : `${venue.name}, ${address}`;
}

/**
 * "13100 Aix-en-Provence" pulled out of a stored address ("12 rue X, 13100
 * Aix-en-Provence, France" -- the shape the geocoding autocomplete saves),
 * or null when no postcode + city part can be found.
 */
export function venueCityLine(address: string | null): string | null {
  const match = address?.match(/\b(\d{4,5})\s+([^,\d][^,]*)/);
  return match ? `${match[1]} ${match[2].trim()}` : null;
}

/** What the tournament header shows: "Stade X, 13100 Aix-en-Provence" (or just the name). */
export function venueDisplayLabel(venue: { name: string; address: string | null }): string {
  const cityLine = venueCityLine(venue.address);
  if (!cityLine || venue.name.toLowerCase().includes(cityLine.toLowerCase())) {
    return venue.name;
  }
  return `${venue.name}, ${cityLine}`;
}

/**
 * Link that opens the venue in the phone's navigation app: Apple Plans on
 * iOS, the Android app chooser (Google Maps, Waze...) via a geo: URI, and
 * Google Maps in a new tab on a computer.
 */
export function venueMapsUrl(
  venue: { name: string; address: string | null },
  platform: MapsPlatform,
): string {
  const query = encodeURIComponent(venueMapsQuery(venue));
  switch (platform) {
    case 'ios':
      return `https://maps.apple.com/?q=${query}`;
    case 'android':
      return `geo:0,0?q=${query}`;
    default:
      return `https://www.google.com/maps/search/?api=1&query=${query}`;
  }
}

export interface NavigationApp {
  id: 'apple' | 'google' | 'waze';
  label: string;
  url: string;
}

/**
 * The navigation apps offered on iPhone/iPad, where iOS has no system
 * "open with" chooser (Android's geo: link already shows every installed
 * GPS app). Universal https links: each opens its app when installed, its
 * website otherwise.
 */
export function venueNavigationApps(venue: {
  name: string;
  address: string | null;
}): NavigationApp[] {
  const query = encodeURIComponent(venueMapsQuery(venue));
  return [
    { id: 'apple', label: 'Plans', url: `https://maps.apple.com/?q=${query}` },
    {
      id: 'google',
      label: 'Google Maps',
      url: `https://www.google.com/maps/search/?api=1&query=${query}`,
    },
    { id: 'waze', label: 'Waze', url: `https://waze.com/ul?q=${query}&navigate=yes` },
  ];
}
