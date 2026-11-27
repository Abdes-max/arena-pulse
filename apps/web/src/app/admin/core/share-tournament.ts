import { inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { shareMessage } from 'design-system';
import { SnackbarService } from '../../core/snackbar.service';

/**
 * "Partager le lien" of the admin's share menus: the tournament's public site
 * with its message (« Suivez X sur TournArena : ... »), through the system
 * share sheet -- or, where the browser has none, both copied to paste
 * (with a confirmation). Call from an injection context.
 */
export function injectShareTournament(): (name: string, url: string) => Promise<void> {
  const transloco = inject(TranslocoService);
  const snackbar = inject(SnackbarService);
  return async (name, url) => {
    const text = transloco.translate('shell.shareText', { name });
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: name, text, url });
        return;
      } catch (error) {
        // Dismissed: nothing more to do. Any other failure: copy instead.
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(shareMessage(text, url));
      snackbar.success(transloco.translate('admin.submenu.shareCopied'));
    } catch {
      snackbar.error(transloco.translate('admin.submenu.shareFailed'));
    }
  };
}
