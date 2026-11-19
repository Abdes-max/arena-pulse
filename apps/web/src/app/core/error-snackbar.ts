import { WritableSignal, effect, inject, untracked } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { SnackbarService } from './snackbar.service';

/**
 * Shows a page's error message in the red snackbar (SnackbarHost) instead of
 * inline: every anomaly appears in the same place, the confirmation
 * snackbar's spot. `source` holds a Transloco key (or, with translate:
 * false, the text itself); it is reset to null once shown, so setting the
 * same error again shows it again.
 *
 * Call from a field initializer (injection context), right after the
 * signal it watches.
 */
export function showErrorsInSnackbar(
  source: WritableSignal<string | null>,
  options: { translate?: boolean } = {},
): void {
  const snackbar = inject(SnackbarService);
  const transloco = inject(TranslocoService);
  effect(() => {
    const message = source();
    if (!message) {
      return;
    }
    untracked(() => {
      snackbar.pageError(options.translate === false ? message : transloco.translate(message));
      source.set(null);
    });
  });
}
