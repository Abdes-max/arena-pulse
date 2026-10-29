import { detectMapsPlatform, venueMapsQuery, venueMapsUrl } from './maps-link.util';

const STADIUM = {
  name: 'Stade Marius Requier',
  address: 'Rond-Point Joséphine Ferrato, 13547 Aix-en-Provence, France',
};

describe('maps link', () => {
  it('detects the platform from the user agent', () => {
    expect(detectMapsPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(
      'ios',
    );
    expect(detectMapsPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios');
    expect(detectMapsPlatform('Mozilla/5.0 (Linux; Android 15; Pixel 9)')).toBe('android');
    expect(detectMapsPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop');
  });

  it('searches the name plus the address, or the name alone', () => {
    expect(venueMapsQuery(STADIUM)).toBe(
      'Stade Marius Requier, Rond-Point Joséphine Ferrato, 13547 Aix-en-Provence, France',
    );
    expect(venueMapsQuery({ name: 'Gymnase', address: null })).toBe('Gymnase');
    expect(venueMapsQuery({ name: '12 rue X', address: '12 rue X, 75001 Paris' })).toBe(
      '12 rue X, 75001 Paris',
    );
  });

  it('builds the right link per platform', () => {
    const venue = { name: 'Stade', address: null };
    expect(venueMapsUrl(venue, 'ios')).toBe('https://maps.apple.com/?q=Stade');
    expect(venueMapsUrl(venue, 'android')).toBe('geo:0,0?q=Stade');
    expect(venueMapsUrl(venue, 'desktop')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Stade',
    );
  });
});
