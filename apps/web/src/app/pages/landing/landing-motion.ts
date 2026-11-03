import { Directive, ElementRef, OnDestroy, OnInit, effect, inject, input } from '@angular/core';

// Shared motion gate for the landing page's scroll effects -- same contract as
// evolyfoot's ScrollEffects: everything renders fully visible first, effects
// are only layered on once JS runs, and only when the visitor hasn't asked
// for reduced motion and the browser has IntersectionObserver (jsdom in unit
// tests doesn't, so the page stays static there too).
function motionAllowed(): boolean {
  return (
    typeof window !== 'undefined' &&
    'IntersectionObserver' in window &&
    !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

// Fades/slides its host in the first time it scrolls into view. Elements
// already above the fold when the page loads are left alone (no flash of
// hidden content for what the visitor is already looking at).
// [appRevealDelay] staggers siblings in a grid (index * 70ms).
@Directive({
  selector: '[appReveal]',
  host: { class: 'app-reveal', '[style.--app-reveal-delay.ms]': 'appRevealDelay() * 70' },
})
export class Reveal implements OnInit, OnDestroy {
  readonly appRevealDelay = input(0);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer?: IntersectionObserver;

  ngOnInit(): void {
    const element = this.host.nativeElement;
    if (!motionAllowed() || element.getBoundingClientRect().top < window.innerHeight * 0.92) {
      return;
    }
    element.classList.add('app-reveal--pending');
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          element.classList.remove('app-reveal--pending');
          this.observer?.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    this.observer.observe(element);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}

// Counts its host's text up to [appCountUp] once visible (900ms ease-out),
// then follows later value changes (e.g. the tournament list resolving after
// the strip is already on screen) by counting from the last shown value.
@Directive({ selector: '[appCountUp]' })
export class CountUp implements OnDestroy {
  readonly appCountUp = input.required<number>();
  readonly appCountUpSuffix = input('');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer?: IntersectionObserver;
  private visible = false;
  private shown = 0;
  private frame = 0;

  constructor() {
    effect(() => {
      const target = this.appCountUp();
      if (!motionAllowed()) {
        this.render(target);
        return;
      }
      if (this.visible) {
        this.animateTo(target);
        return;
      }
      this.render(0);
      if (!this.observer) {
        this.observer = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            this.visible = true;
            this.observer?.disconnect();
            this.animateTo(this.appCountUp());
          }
        });
        this.observer.observe(this.host.nativeElement);
      }
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    cancelAnimationFrame(this.frame);
  }

  private animateTo(target: number): void {
    cancelAnimationFrame(this.frame);
    const from = this.shown;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / 900, 1);
      const eased = 1 - (1 - progress) ** 3;
      this.render(Math.round(from + (target - from) * eased));
      if (progress < 1) {
        this.frame = requestAnimationFrame(step);
      }
    };
    this.frame = requestAnimationFrame(step);
  }

  private render(value: number): void {
    this.shown = value;
    this.host.nativeElement.textContent = `${value}${this.appCountUpSuffix()}`;
  }
}
