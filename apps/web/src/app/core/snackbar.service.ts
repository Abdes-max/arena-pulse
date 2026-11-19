import { Injectable, signal } from '@angular/core';

export type SnackbarKind = 'success' | 'error';

export interface SnackbarMessage {
  id: number;
  text: string;
  kind: SnackbarKind;
}

const DURATION_MS: Record<SnackbarKind, number> = { success: 3000, error: 6000 };
// A request failure and the page catching it land within a few ms.
const PAGE_ERROR_DEDUPE_MS = 1000;
const MAX_VISIBLE = 3;

/** Short-lived messages at the bottom of the screen (shown by SnackbarHost). */
@Injectable({ providedIn: 'root' })
export class SnackbarService {
  private nextId = 1;
  private lastErrorAt = 0;
  readonly messages = signal<SnackbarMessage[]>([]);

  success(text: string): void {
    this.show(text, 'success');
  }

  error(text: string): void {
    this.lastErrorAt = Date.now();
    this.show(text, 'error');
  }

  /**
   * A page's own error (showErrorsInSnackbar). Skipped when an error was
   * shown just before: a failed request already put the API's own, more
   * precise message there (feedbackInterceptor), and the page's generic
   * "save failed" would only repeat it.
   */
  pageError(text: string): void {
    if (Date.now() - this.lastErrorAt < PAGE_ERROR_DEDUPE_MS) {
      return;
    }
    this.error(text);
  }

  dismiss(id: number): void {
    this.messages.update((messages) => messages.filter((message) => message.id !== id));
  }

  private show(text: string, kind: SnackbarKind): void {
    const id = this.nextId++;
    this.messages.update((messages) => [...messages, { id, text, kind }].slice(-MAX_VISIBLE));
    setTimeout(() => this.dismiss(id), DURATION_MS[kind]);
  }
}
