import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { SnackbarService } from '../../core/snackbar.service';

/**
 * Renders SnackbarService's messages, stacked at the bottom of every page.
 *
 * Pinned to the *visible* part of the page (window.visualViewport), not the
 * layout viewport plain `position: fixed` uses: on a phone, with the
 * keyboard still open after typing in a form (or the page zoomed), the
 * latter's bottom sits under the keyboard / off screen, and the message
 * only showed after scrolling.
 */
@Component({
  selector: 'app-snackbar-host',
  imports: [TranslocoPipe],
  template: `
    <div
      class="snackbar-host"
      aria-live="polite"
      [style.--snackbar-lift.px]="viewport().lift"
      [style.--snackbar-center.px]="viewport().center"
      [style.--snackbar-width.px]="viewport().width"
    >
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
      left: var(--snackbar-center, 50%);
      bottom: calc(16px + var(--snackbar-lift, 0px) + env(safe-area-inset-bottom, 0px));
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: min(560px, var(--snackbar-width, calc(100vw - 32px)));
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
  // lift: px between the layout viewport's bottom and the visible one's;
  // center/width: the visible area's middle and usable width (null = CSS default).
  protected readonly viewport = signal<{
    lift: number;
    center: number | null;
    width: number | null;
  }>({ lift: 0, center: null, width: null });

  constructor() {
    const visual = typeof window === 'undefined' ? undefined : window.visualViewport;
    if (!visual) {
      return;
    }
    const update = () => {
      const layoutHeight = document.documentElement.clientHeight;
      this.viewport.set({
        lift: Math.max(0, layoutHeight - (visual.offsetTop + visual.height)),
        center: visual.offsetLeft + visual.width / 2,
        width: visual.width - 32,
      });
    };
    visual.addEventListener('resize', update);
    visual.addEventListener('scroll', update);
    update();
    inject(DestroyRef).onDestroy(() => {
      visual.removeEventListener('resize', update);
      visual.removeEventListener('scroll', update);
    });
  }
}
