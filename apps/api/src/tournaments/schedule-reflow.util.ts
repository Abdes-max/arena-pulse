export interface SlotTimes {
  id: string;
  fieldId: string;
  start: Date;
  end: Date;
}

export interface MovingSlot {
  /** null for a match that has no slot yet (one is created). */
  id: string | null;
  fieldId: string | null;
  start: Date | null;
  lengthMs: number;
}

/**
 * Moves one slot to position `index` of a field's column and returns the new
 * times of every slot that changes, the moved one included (keyed by id,
 * `null` key for a slot still to create). The column it leaves closes the
 * gap (the following slots start earlier by its length); the column it joins
 * opens one (the following slots start later). Shifts keep every other gap,
 * like a break between two phases.
 */
export function reflowMove(
  slotsByField: Map<string, SlotTimes[]>,
  moving: MovingSlot,
  targetFieldId: string,
  index: number,
  fallbackStart: Date,
): Map<string | null, { fieldId: string; start: Date; end: Date }> {
  const L = moving.lengthMs;
  const times = new Map<string, SlotTimes>();
  for (const slots of slotsByField.values()) {
    for (const slot of slots) {
      times.set(slot.id, { ...slot });
    }
  }
  const sorted = (fieldId: string) =>
    [...times.values()]
      .filter((slot) => slot.fieldId === fieldId && slot.id !== moving.id)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

  // Leaving its column: what came after moves up.
  if (moving.id !== null && moving.fieldId !== null && moving.start !== null) {
    for (const slot of sorted(moving.fieldId)) {
      if (slot.start.getTime() >= moving.start.getTime()) {
        slot.start = new Date(slot.start.getTime() - L);
        slot.end = new Date(slot.end.getTime() - L);
      }
    }
  }

  // Joining the target column at `index`: what comes after moves down.
  const column = sorted(targetFieldId);
  const at = Math.max(0, Math.min(index, column.length));
  const start =
    column.length === 0
      ? (moving.start ?? fallbackStart)
      : at < column.length
        ? column[at].start
        : column[column.length - 1].end;
  for (const slot of column.slice(at)) {
    slot.start = new Date(slot.start.getTime() + L);
    slot.end = new Date(slot.end.getTime() + L);
  }

  const result = new Map<
    string | null,
    { fieldId: string; start: Date; end: Date }
  >();
  for (const [id, slot] of times) {
    const original = [...slotsByField.values()]
      .flat()
      .find((s) => s.id === id)!;
    if (
      id !== moving.id &&
      (slot.start.getTime() !== original.start.getTime() ||
        slot.fieldId !== original.fieldId)
    ) {
      result.set(id, {
        fieldId: slot.fieldId,
        start: slot.start,
        end: slot.end,
      });
    }
  }
  result.set(moving.id, {
    fieldId: targetFieldId,
    start,
    end: new Date(start.getTime() + L),
  });
  return result;
}
