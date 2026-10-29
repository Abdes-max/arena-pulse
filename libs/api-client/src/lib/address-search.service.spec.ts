import { vi } from 'vitest';
import { AddressAutocomplete, AddressSuggestion } from './address-search.service';

const RESULT: AddressSuggestion = {
  label: 'Stade Marius Requier',
  detail: '13290 Aix-en-Provence, France',
  name: 'Stade Marius Requier',
  address: '13290 Aix-en-Provence, France',
  lat: 43.5,
  lon: 5.4,
};

describe('AddressAutocomplete', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('searches once after the typing pause, not on every keystroke', async () => {
    const search = vi.fn().mockResolvedValue([RESULT]);
    const autocomplete = new AddressAutocomplete(search);

    autocomplete.query('sta');
    autocomplete.query('stad');
    autocomplete.query('stade');
    await vi.advanceTimersByTimeAsync(300);

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('stade');
    expect(autocomplete.suggestions()).toEqual([RESULT]);
    expect(autocomplete.loading()).toBe(false);
  });

  it('does not search under 3 characters and clears old results', async () => {
    const search = vi.fn().mockResolvedValue([RESULT]);
    const autocomplete = new AddressAutocomplete(search);
    autocomplete.query('stade');
    await vi.advanceTimersByTimeAsync(300);

    autocomplete.query('st');
    await vi.advanceTimersByTimeAsync(300);

    expect(search).toHaveBeenCalledTimes(1);
    expect(autocomplete.suggestions()).toEqual([]);
  });

  it('flags a failed search', async () => {
    const autocomplete = new AddressAutocomplete(vi.fn().mockRejectedValue(new Error('502')));
    autocomplete.query('stade');
    await vi.advanceTimersByTimeAsync(300);

    expect(autocomplete.failed()).toBe(true);
    expect(autocomplete.suggestions()).toEqual([]);
  });
});
