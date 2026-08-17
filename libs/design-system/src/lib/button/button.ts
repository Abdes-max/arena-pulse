import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'sm';

@Component({
  selector: 'ap-button',
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive],
  templateUrl: './button.html',
  styleUrl: './button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-variant]': 'variant()',
    '[attr.data-size]': 'size()',
    '[attr.data-disabled]': 'disabled() || null',
    '[attr.data-full-width]': 'fullWidth() || null',
  },
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');
  /** 'sm' for dense contexts (e.g. a data-entry table row) -- 'md' (default) elsewhere. */
  readonly size = input<ButtonSize>('md');
  readonly type = input<'button' | 'submit'>('button');
  readonly disabled = input(false);
  /** Stretches the button to fill its container's width (e.g. stacked CTAs in a narrow hero) instead of the default shrink-to-content sizing. */
  readonly fullWidth = input(false);
  /** When set, renders an <a> instead of a <button> — same look, but for navigation rather than an action. */
  readonly href = input<string | undefined>(undefined);
  readonly target = input<string | undefined>(undefined);
  /** When set, renders an <a routerLink> instead of a <button> — for in-app navigation (e.g. a tab-style sub-menu), with the active tab highlighted automatically. Takes precedence over `href`. */
  readonly routerLink = input<string | unknown[] | undefined>(undefined);
  readonly routerLinkExact = input(false);
}
