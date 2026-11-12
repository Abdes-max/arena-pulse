import { reflowMove, SlotTimes } from './schedule-reflow.util';

const t = (hhmm: string) => new Date(`2026-08-01T${hhmm}:00.000Z`);
const slot = (
  id: string,
  fieldId: string,
  start: string,
  end: string,
): SlotTimes => ({
  id,
  fieldId,
  start: t(start),
  end: t(end),
});

describe('reflowMove', () => {
  const fields = () =>
    new Map<string, SlotTimes[]>([
      [
        'A',
        [
          slot('a1', 'A', '09:00', '09:30'),
          slot('a2', 'A', '09:30', '10:00'),
          slot('a3', 'A', '10:00', '10:30'),
        ],
      ],
      [
        'B',
        [slot('b1', 'B', '09:00', '09:30'), slot('b2', 'B', '09:30', '10:00')],
      ],
    ]);

  it('moves a slot to another field: the source closes the gap, the target opens one', () => {
    const result = reflowMove(
      fields(),
      { id: 'a1', fieldId: 'A', start: t('09:00'), lengthMs: 30 * 60_000 },
      'B',
      1,
      t('09:00'),
    );
    expect(result.get('a1')).toEqual({
      fieldId: 'B',
      start: t('09:30'),
      end: t('10:00'),
    });
    expect(result.get('a2')?.start).toEqual(t('09:00'));
    expect(result.get('a3')?.start).toEqual(t('09:30'));
    expect(result.get('b2')?.start).toEqual(t('10:00'));
    expect(result.has('b1')).toBe(false);
  });

  it('reorders within the same field', () => {
    const result = reflowMove(
      fields(),
      { id: 'a3', fieldId: 'A', start: t('10:00'), lengthMs: 30 * 60_000 },
      'A',
      0,
      t('09:00'),
    );
    expect(result.get('a3')).toEqual({
      fieldId: 'A',
      start: t('09:00'),
      end: t('09:30'),
    });
    expect(result.get('a1')?.start).toEqual(t('09:30'));
    expect(result.get('a2')?.start).toEqual(t('10:00'));
  });

  it('keeps a break between two phases when shifting', () => {
    const map = fields();
    map.set('B', [
      slot('b1', 'B', '09:00', '09:30'),
      slot('b9', 'B', '11:00', '11:30'),
    ]);
    const result = reflowMove(
      map,
      { id: null, fieldId: null, start: null, lengthMs: 30 * 60_000 },
      'B',
      1,
      t('09:00'),
    );
    expect(result.get(null)).toEqual({
      fieldId: 'B',
      start: t('11:00'),
      end: t('11:30'),
    });
    expect(result.get('b9')?.start).toEqual(t('11:30'));
  });
});
