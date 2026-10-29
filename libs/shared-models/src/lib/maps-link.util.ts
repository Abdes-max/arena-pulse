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
