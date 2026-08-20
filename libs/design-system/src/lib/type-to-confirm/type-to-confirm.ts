import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Button } from '../button/button';
import { TextField } from '../text-field/text-field';

/**
 * "Type SUPPRIMER to confirm" gate for destructive actions (feat/173) --
 * replaces password re-confirmation on the two self-deletion "Mon compte"
 * pages, and gates every super-admin-initiated deletion (organization,
 * organizer account, tournament, team, player). Deliberately does NOT
 * manage a collapsed/revealed "danger zone" wrapper itself -- each calling
 * page keeps that part (in-page reveal, not a modal), same as feat/171.
 *
 * French defaults throughout, consistent with the super-admin panel having
 * no i18n -- pages in the (Transloco-driven) organizer admin override
 * `label`/`confirmLabel`/`pendingLabel`/`cancelLabel` with translated text.
 */
@Component({
  selector: 'ap-type-to-confirm',
  imports: [Button, TextField],
  templateUrl: './type-to-confirm.html',
  styleUrl: './type-to-confirm.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TypeToConfirm {
  readonly confirmWord = input('SUPPRIMER');
  /** Defaults to "Tapez {confirmWord} pour confirmer" when not overridden. */
  readonly label = input<string | null>(null);
  readonly confirmLabel = input('Confirmer la suppression');
  readonly pendingLabel = input('Suppression…');
  readonly cancelLabel = input('Annuler');
  /** Disables both buttons while the caller's delete request is in flight. */
  readonly pending = input(false);

  readonly confirm = output<void>();
  // Named `cancelled`, not `cancel` -- @angular-eslint/no-output-native
  // flags `cancel` as a reserved native DOM event name (e.g. <dialog>).
  readonly cancelled = output<void>();

  protected readonly typedValue = signal('');

  protected readonly computedLabel = computed(
    () => this.label() ?? `Tapez ${this.confirmWord()} pour confirmer`,
  );

  protected readonly matches = computed(
    () => this.typedValue().trim().toUpperCase() === this.confirmWord().trim().toUpperCase(),
  );

  protected onTypedValueChange(value: string): void {
    this.typedValue.set(value);
  }

  protected onConfirm(): void {
    if (this.matches() && !this.pending()) {
      this.confirm.emit();
    }
  }
}
