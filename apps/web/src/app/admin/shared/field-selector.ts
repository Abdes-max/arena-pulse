import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export interface SelectableField {
  id: string;
  name: string;
  venueName: string;
}

/**
 * Terrain picker shared by every "générer le calendrier" flow (Calendrier,
 * Mode Tournoi's pool and tableau schedules) -- was three copies of a bare
 * checkbox list with no bulk-select. Pill-style toggles instead of native
 * checkboxes, plus one-click "Tout sélectionner"/"Tout désélectionner".
 */
@Component({
  selector: 'app-field-selector',
  imports: [],
  templateUrl: './field-selector.html',
  styleUrl: './field-selector.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldSelector {
  readonly fields = input.required<SelectableField[]>();
  readonly selectedIds = input<string[]>([]);
  readonly selectedIdsChange = output<string[]>();

  protected readonly allSelected = computed(
    () => this.fields().length > 0 && this.selectedIds().length === this.fields().length,
  );

  protected isSelected(fieldId: string): boolean {
    return this.selectedIds().includes(fieldId);
  }

  protected toggle(fieldId: string): void {
    const current = this.selectedIds();
    this.selectedIdsChange.emit(
      current.includes(fieldId) ? current.filter((id) => id !== fieldId) : [...current, fieldId],
    );
  }

  protected toggleAll(): void {
    this.selectedIdsChange.emit(this.allSelected() ? [] : this.fields().map((field) => field.id));
  }
}
