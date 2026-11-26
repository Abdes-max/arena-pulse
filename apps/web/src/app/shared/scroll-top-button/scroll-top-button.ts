import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** Scrolled this far (px), the button shows up. */
const SHOW_AFTER = 600;

/**
 * Small see-through arrow, bottom-right of every web page, back to the top
 * once the page has been scrolled down. Listens in the capture phase so it
 * also follows a page that scrolls inside its own container, not the
 * document.
 */
@Component({
  selector: 'app-scroll-top-button',
  imports: [TranslocoPipe],
  template: `
    @if (visible()) {
      <button
        type="button"
        class="scroll-top-button"
        [attr.aria-label]="'feedback.scrollTop' | transloco"
        [title]="'feedback.scrollTop' | transloco"
        (click)="scrollToTop()"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 15 L12 9 L18 15" />
        </svg>
      </button>
    }
  `,
  styles: `
    .scroll-top-button {
      position: fixed;
      right: max(16px, env(safe-area-inset-right, 0px));
      bottom: max(16px, env(safe-area-inset-bottom, 0px));
      z-index: 900;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      padding: 0;
      border: 1px solid rgb(255 255 255 / 25%);
      border-radius: 999px;
      background: rgb(15 23 42 / 35%);
      backdrop-filter: blur(6px);
      color: #fff;
      cursor: pointer;
      opacity: 0.75;
      transition: opacity 0.15s ease;
      animation: scroll-top-in 0.18s ease-out;

      &:hover,
      &:focus-visible {
        opacity: 1;
      }

      svg {
        width: 20px;
        height: 20px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
    }

    @keyframes scroll-top-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }

    @media print {
      .scroll-top-button {
        display: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScrollTopButton {
  protected readonly visible = signal(false);
  // The element that last scrolled: the document, or a page's own container.
  private scroller: Element | null = null;

  constructor() {
    const onScroll = (event: Event): void => {
      const target = event.target;
      const element =
        target instanceof Element
          ? target
          : (document.scrollingElement ?? document.documentElement);
      this.scroller = element;
      this.visible.set(element.scrollTop > SHOW_AFTER);
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    inject(DestroyRef).onDestroy(() =>
      document.removeEventListener('scroll', onScroll, { capture: true }),
    );
  }

  protected scrollToTop(): void {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    (this.scroller ?? document.documentElement).scrollTo({
      top: 0,
      behavior: reduce ? 'auto' : 'smooth',
    });
    this.visible.set(false);
  }
}
