import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Button } from 'design-system';

/** Row of filters above a super-admin table: projected controls, result count, reset. */
@Component({
  selector: 'app-super-admin-filter-bar',
  imports: [Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="filter-bar" role="search">
      <div class="filter-bar__controls"><ng-content /></div>
      <div class="filter-bar__footer">
        <span class="filter-bar__count" aria-live="polite">
          {{ shown() }} résultat{{ shown() > 1 ? 's' : '' }} sur {{ total() }}
        </span>
        @if (active()) {
          <ap-button type="button" variant="ghost" size="sm" (click)="filtersReset.emit()">
            Réinitialiser les filtres
          </ap-button>
        }
      </div>
    </div>
  `,
  styles: `
    .filter-bar {
      display: flex;
      flex-direction: column;
      gap: var(--ap-space-3);
      margin-bottom: var(--ap-space-4);
    }
    .filter-bar__controls {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: var(--ap-space-4);
    }
    .filter-bar__controls > * {
      min-width: 11rem;
    }
    .filter-bar__footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ap-space-3);
      color: var(--ap-color-muted);
      font-size: 0.85rem;
    }
  `,
})
export class SuperAdminFilterBar {
  readonly shown = input.required<number>();
  readonly total = input.required<number>();
  /** Whether any filter differs from its default (shows the reset button). */
  readonly active = input.required<boolean>();
  readonly filtersReset = output<void>();
}
