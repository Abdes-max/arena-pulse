import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * A filling bar with its count -- "Inscriptions U13 · 12/16", then a note
 * ("4 places restantes · clôture samedi"). Fills up once on display, then a
 * light sweeps along the filled part while places remain.
 */
@Component({
  selector: 'ap-fill-bar',
  templateUrl: './fill-bar.html',
  styleUrl: './fill-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FillBar {
  readonly label = input.required<string>();
  readonly filled = input.required<number>();
  readonly total = input.required<number>();
  readonly note = input<string | null>(null);

  protected readonly percent = computed(() => {
    const total = this.total();
    return total > 0 ? Math.min(100, Math.max(0, (this.filled() / total) * 100)) : 0;
  });
  protected readonly full = computed(() => this.total() > 0 && this.filled() >= this.total());
}
