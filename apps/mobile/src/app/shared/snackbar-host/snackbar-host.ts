import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { SnackbarService } from '../../core/snackbar.service';

/** Renders SnackbarService's messages above the footers and tab bar of every page (same look as apps/web). */
@Component({
  selector: 'app-snackbar-host',
  imports: [TranslocoPipe],
  template: `
    <div class="snackbar-host" aria-live="polite">
      @for (message of snackbar.messages(); track message.id) {
        <div
          class="snackbar-host__item"
          [class.snackbar-host__item--error]="message.kind === 'error'"
          [attr.role]="message.kind === 'error' ? 'alert' : 'status'"
        >
          <span class="snackbar-host__text">{{ message.text }}</span>
          <button
            type="button"
            class="snackbar-host__close"
            [attr.aria-label]="'feedback.close' | transloco"
            (click)="snackbar.dismiss(message.id)"
          >
            ×
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .snackbar-host {
      position: fixed;
      left: 50%;
      /* Clears the ion-footer action bars and the public site tab bar. */
      bottom: calc(88px + env(safe-area-inset-bottom, 0px));
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: min(560px, calc(100vw - 32px));
      transform: translateX(-50%);
      pointer-events: none;
    }

    .snackbar-host__item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 8px 10px 16px;
      color: #fff;
      background: #1f7a4d;
      border-radius: 10px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
      font-size: 0.95rem;
      pointer-events: auto;
      animation: snackbar-in 0.18s ease-out;
    }

    .snackbar-host__item--error {
      background: #b3261e;
    }

    .snackbar-host__text {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .snackbar-host__close {
      width: 36px;
      height: 36px;
      font: inherit;
      font-size: 1.3rem;
      color: inherit;
      background: transparent;
      border: none;
      border-radius: 999px;
      cursor: pointer;
    }

    @keyframes snackbar-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .snackbar-host__item {
        animation: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SnackbarHost {
  protected readonly snackbar = inject(SnackbarService);
}
