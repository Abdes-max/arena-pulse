import { Injectable, signal } from '@angular/core';

export type SnackbarKind = 'success' | 'error';

export interface SnackbarMessage {
  id: number;
  text: string;
  kind: SnackbarKind;
}

const DURATION_MS: Record<SnackbarKind, number> = { success: 3000, error: 6000 };
const MAX_VISIBLE = 3;

/**
 * Short-lived messages at the bottom of the screen (shown by SnackbarHost) --
 * same as apps/web's SnackbarService: every anomaly shows here, in red.
 */
@Injectable({ providedIn: 'root' })
export class SnackbarService {
  private nextId = 1;
  readonly messages = signal<SnackbarMessage[]>([]);

  success(text: string): void {
    this.show(text, 'success');
  }

  error(text: string): void {
    this.show(text, 'error');
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
