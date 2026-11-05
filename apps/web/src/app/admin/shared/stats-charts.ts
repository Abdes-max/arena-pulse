import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Small dependency-free chart primitives for the admin dashboards
 * (TournamentListPage's organization strip, TournamentStatsPage) -- plain
 * SVG/CSS bound to design tokens, so they follow the active theme and dark
 * mode like the rest of the admin. Every chart keeps its numbers as visible
 * text (or an aria-label for the purely graphical ring) so nothing is
 * conveyed by shape or color alone.
 */

export type StatsTone = 'primary' | 'success' | 'warning' | 'error' | 'muted' | 'signal';

export interface StatsDatum {
  label: string;
  value: number;
  // Secondary text after the value (e.g. "3 matchs").
  hint?: string;
  tone?: StatsTone;
}

const SHARED_STYLES = `
  :host { display: block; color: var(--ap-color-fg); font-family: var(--ap-font-body); }
  .tone-primary { --stats-tone: var(--ap-color-primary); }
  .tone-success { --stats-tone: var(--ap-color-success); }
  .tone-warning { --stats-tone: var(--ap-color-warning); }
  .tone-error { --stats-tone: var(--ap-color-error); }
  .tone-muted { --stats-tone: var(--ap-color-border); }
  .tone-signal { --stats-tone: var(--ap-color-signal); }
  @keyframes stats-grow-x { from { transform: scaleX(0); } }
  @keyframes stats-grow-y { from { transform: scaleY(0); } }
  @media (prefers-reduced-motion: reduce) {
    * { animation: none !important; transition: none !important; }
  }
`;

/** Completion ring: `value` out of `total`, percentage in the middle. */
@Component({
  selector: 'app-stats-ring',
  imports: [DecimalPipe],
  template: `
    <div class="ring" [class]="'ring tone-' + tone()">
      <svg viewBox="0 0 120 120" role="img" [attr.aria-label]="ariaLabel()">
        <circle class="ring__track" cx="60" cy="60" r="52" />
        <circle
          class="ring__value"
          cx="60"
          cy="60"
          r="52"
          [attr.stroke-dasharray]="circumference"
          [attr.stroke-dashoffset]="offset()"
        />
      </svg>
      <div class="ring__center" aria-hidden="true">
        <span class="ring__percent">{{ ratio() * 100 | number: '1.0-0' }}%</span>
        <span class="ring__caption">{{ value() }} / {{ total() }}</span>
      </div>
    </div>
  `,
  styles: [
    SHARED_STYLES,
    `
      .ring {
        position: relative;
        width: 100%;
        max-width: 168px;
        margin: 0 auto;
      }
      svg {
        display: block;
        width: 100%;
        height: auto;
        transform: rotate(-90deg);
      }
      circle {
        fill: none;
        stroke-width: 12;
      }
      .ring__track {
        stroke: var(--ap-color-border);
      }
      .ring__value {
        stroke: var(--stats-tone);
        stroke-linecap: round;
        transition: stroke-dashoffset 900ms var(--ap-easing-standard);
      }
      .ring__center {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
      }
      .ring__percent {
        font-family: var(--ap-font-heading);
        font-size: 1.6rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .ring__caption {
        font-size: 0.8rem;
        color: var(--ap-color-muted);
        font-variant-numeric: tabular-nums;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsRing {
  readonly value = input.required<number>();
  readonly total = input.required<number>();
  readonly label = input('');
  readonly tone = input<StatsTone>('primary');

  protected readonly circumference = 2 * Math.PI * 52;
  protected readonly ratio = computed(() => {
    const total = this.total();
    return total > 0 ? Math.min(1, this.value() / total) : 0;
  });
  protected readonly offset = computed(() => this.circumference * (1 - this.ratio()));
  protected readonly ariaLabel = computed(() =>
    `${this.label()} ${this.value()} / ${this.total()}`.trim(),
  );
}

/** Horizontal bars, one row per datum, scaled to the largest value. */
@Component({
  selector: 'app-stats-bars',
  template: `
    @if (items().length === 0) {
      <p class="bars__empty">{{ emptyLabel() }}</p>
    } @else {
      <ol class="bars">
        @for (item of items(); track $index) {
          <li class="bars__row" [class]="'bars__row tone-' + (item.tone ?? tone())">
            <span class="bars__label">{{ item.label }}</span>
            <span class="bars__value">
              {{ item.value }}
              @if (item.hint) {
                <small>{{ item.hint }}</small>
              }
            </span>
            <span class="bars__track" aria-hidden="true">
              <span class="bars__fill" [style.width.%]="percent(item.value)"></span>
            </span>
          </li>
        }
      </ol>
    }
  `,
  styles: [
    SHARED_STYLES,
    `
      .bars {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--ap-space-3);
      }
      .bars__row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: var(--ap-space-1) var(--ap-space-2);
        align-items: baseline;
      }
      .bars__label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.9rem;
      }
      .bars__value {
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .bars__value small {
        font-weight: 400;
        color: var(--ap-color-muted);
        margin-left: var(--ap-space-1);
      }
      .bars__track {
        grid-column: 1 / -1;
        height: 8px;
        border-radius: var(--ap-radius-pill);
        background: color-mix(in srgb, var(--ap-color-border) 60%, transparent);
        overflow: hidden;
      }
      .bars__fill {
        display: block;
        height: 100%;
        min-width: 4px;
        border-radius: inherit;
        background: var(--stats-tone);
        transform-origin: left;
        animation: stats-grow-x 700ms var(--ap-easing-standard) both;
      }
      .bars__empty {
        margin: 0;
        color: var(--ap-color-muted);
        font-size: 0.9rem;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsBars {
  readonly items = input.required<StatsDatum[]>();
  readonly tone = input<StatsTone>('primary');
  readonly emptyLabel = input('');

  private readonly max = computed(() => Math.max(0, ...this.items().map((item) => item.value)));

  protected percent(value: number): number {
    const max = this.max();
    return max > 0 ? (value / max) * 100 : 0;
  }
}

/** Vertical columns over a short ordered series (months, hours). */
@Component({
  selector: 'app-stats-columns',
  template: `
    <ol class="columns" [class]="'columns tone-' + tone()">
      @for (item of items(); track $index) {
        <li class="columns__col">
          <span class="columns__value">{{ item.value }}</span>
          <span class="columns__track" aria-hidden="true">
            <span class="columns__fill" [style.height.%]="percent(item.value)"></span>
          </span>
          <span class="columns__label">{{ item.label }}</span>
        </li>
      }
    </ol>
  `,
  styles: [
    SHARED_STYLES,
    `
      .columns {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        align-items: stretch;
        gap: var(--ap-space-2);
        height: 160px;
      }
      .columns__col {
        flex: 1 1 0;
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--ap-space-1);
      }
      .columns__value {
        font-size: 0.8rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .columns__track {
        flex: 1;
        width: 100%;
        max-width: 40px;
        display: flex;
        align-items: flex-end;
      }
      .columns__fill {
        display: block;
        width: 100%;
        min-height: 3px;
        border-radius: var(--ap-radius-sm) var(--ap-radius-sm) 0 0;
        background: var(--stats-tone);
        transform-origin: bottom;
        animation: stats-grow-y 700ms var(--ap-easing-standard) both;
      }
      .columns__label {
        font-size: 0.75rem;
        color: var(--ap-color-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsColumns {
  readonly items = input.required<StatsDatum[]>();
  readonly tone = input<StatsTone>('primary');

  private readonly max = computed(() => Math.max(0, ...this.items().map((item) => item.value)));

  protected percent(value: number): number {
    const max = this.max();
    return max > 0 ? (value / max) * 100 : 0;
  }
}

/** One stacked bar split into parts of a whole, with a legend below. */
@Component({
  selector: 'app-stats-segments',
  template: `
    <div class="segments__bar" aria-hidden="true">
      @for (item of visibleItems(); track item.label) {
        <span
          [class]="'segments__part tone-' + (item.tone ?? 'primary')"
          [style.flex-grow]="item.value"
        ></span>
      }
    </div>
    <ul class="segments__legend">
      @for (item of items(); track $index) {
        <li [class]="'tone-' + (item.tone ?? 'primary')">
          <span class="segments__dot" aria-hidden="true"></span>
          <span class="segments__name">{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </li>
      }
    </ul>
  `,
  styles: [
    SHARED_STYLES,
    `
      .segments__bar {
        display: flex;
        gap: 3px;
        height: 14px;
        border-radius: var(--ap-radius-pill);
        overflow: hidden;
        background: color-mix(in srgb, var(--ap-color-border) 60%, transparent);
        transform-origin: left;
        animation: stats-grow-x 800ms var(--ap-easing-standard) both;
      }
      .segments__part {
        flex-basis: 0;
        min-width: 6px;
        background: var(--stats-tone);
      }
      .segments__legend {
        list-style: none;
        margin: var(--ap-space-3) 0 0;
        padding: 0;
        display: flex;
        flex-wrap: wrap;
        gap: var(--ap-space-2) var(--ap-space-4);
        font-size: 0.85rem;
      }
      .segments__legend li {
        display: inline-flex;
        align-items: center;
        gap: var(--ap-space-1);
      }
      .segments__name {
        color: var(--ap-color-muted);
      }
      .segments__legend strong {
        font-variant-numeric: tabular-nums;
      }
      .segments__dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--stats-tone);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsSegments {
  readonly items = input.required<StatsDatum[]>();

  protected readonly visibleItems = computed(() => this.items().filter((item) => item.value > 0));
}
