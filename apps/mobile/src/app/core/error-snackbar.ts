import { Signal, WritableSignal, effect, inject, untracked } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { SnackbarService } from './snackbar.service';

/**
 * Shows a page's error message in the red snackbar (SnackbarHost) instead of
 * inline -- same as apps/web's helper. `source` holds a Transloco key (or,
 * with translate: false, the text itself); it is reset to null once shown,
 * so setting the same error again shows it again. `detail` (optional, plain
 * text) is appended, e.g. the server's own reason.
 *
 * Call from a field initializer (injection context), after the signals it
 * reads.
 */
export function showErrorsInSnackbar(
  source: WritableSignal<string | null>,
  options: { detail?: Signal<string | null>; translate?: boolean } = {},
): void {
  const snackbar = inject(SnackbarService);
  const transloco = inject(TranslocoService);
  effect(() => {
    const message = source();
    if (!message) {
      return;
    }
    untracked(() => {
      const extra = options.detail?.();
      const text = options.translate === false ? message : transloco.translate(message);
      snackbar.error(extra ? `${text} ${extra}` : text);
      source.set(null);
    });
  });
}
