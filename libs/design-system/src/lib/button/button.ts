import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

@Component({
  selector: 'ap-button',
  imports: [NgTemplateOutlet],
  templateUrl: './button.html',
  styleUrl: './button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-variant]': 'variant()',
    '[attr.data-disabled]': 'disabled() || null',
  },
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');
  readonly type = input<'button' | 'submit'>('button');
  readonly disabled = input(false);
  /** When set, renders an <a> instead of a <button> — same look, but for navigation rather than an action. */
  readonly href = input<string | undefined>(undefined);
  readonly target = input<string | undefined>(undefined);
}
