import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/** One set being typed: strings, so an empty box stays distinguishable from a 0. */
export interface SetDraft {
  home: string;
  away: string;
}

export interface SetsInputLabels {
  set: string;
  home: string;
  away: string;
  add: string;
  remove: string;
}

const DEFAULT_LABELS: SetsInputLabels = {
  set: 'Set',
  home: 'Score domicile',
  away: 'Score extérieur',
  add: '+ Set',
  remove: 'Retirer le dernier set',
};

/**
 * Score entry for sets sports (padel, tennis, volleyball, badminton): one row
 * per set, home vs away, with a button to add another up to the format's
 * maximum (best of 2n - 1). Controlled: the page owns the drafts and writes
 * them back from (setsChange). The match's total (sets won) is derived by the
 * API from these rows, so it is only previewed here, never typed.
 */
@Component({
  selector: 'ap-sets-input',
  templateUrl: './sets-input.html',
  styleUrl: './sets-input.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetsInput {
  readonly sets = input.required<SetDraft[]>();
  /** Sets a side must win -- caps the rows at 2 * setsToWin - 1. */
  readonly setsToWin = input(2);
  readonly labels = input<Partial<SetsInputLabels>>({});
  readonly disabled = input(false);
  readonly setsChange = output<SetDraft[]>();

  protected readonly text = computed<SetsInputLabels>(() => ({
    ...DEFAULT_LABELS,
    ...this.labels(),
  }));
  protected readonly rows = computed<SetDraft[]>(() =>
    this.sets().length > 0 ? this.sets() : [{ home: '', away: '' }],
  );
  protected readonly maxSets = computed(() => 2 * this.setsToWin() - 1);
  protected readonly canAdd = computed(() => this.rows().length < this.maxSets());
  protected readonly canRemove = computed(() => this.rows().length > 1);
  // Sets won so far, previewed next to the rows (the API recomputes it).
  protected readonly won = computed(() => {
    let home = 0;
    let away = 0;
    for (const set of this.rows()) {
      if (set.home === '' || set.away === '') continue;
      if (Number(set.home) > Number(set.away)) home++;
      else if (Number(set.away) > Number(set.home)) away++;
    }
    return { home, away };
  });

  protected update(index: number, key: keyof SetDraft, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.setsChange.emit(
      this.rows().map((set, i) => (i === index ? { ...set, [key]: value } : set)),
    );
  }

  protected add(): void {
    this.setsChange.emit([...this.rows(), { home: '', away: '' }]);
  }

  protected removeLast(): void {
    this.setsChange.emit(this.rows().slice(0, -1));
  }
}
