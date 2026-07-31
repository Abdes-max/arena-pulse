import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Badge, Button } from 'design-system';

export interface OnboardingStep {
  key: string;
  title: string;
  description: string;
  done: boolean;
  actionLabel: string;
}

/**
 * A short checklist of setup steps shown on the dashboard until an
 * organization has completed (or dismissed) all of them — helps a
 * first-time organizer find their footing without hunting through the nav.
 */
@Component({
  selector: 'app-onboarding-checklist',
  imports: [Badge, Button],
  templateUrl: './onboarding-checklist.html',
  styleUrl: './onboarding-checklist.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingChecklist {
  readonly steps = input.required<OnboardingStep[]>();
  readonly stepClick = output<string>();
  readonly dismiss = output<void>();

  protected readonly completedCount = computed(
    () => this.steps().filter((step) => step.done).length,
  );

  protected onStepClick(step: OnboardingStep): void {
    if (!step.done) {
      this.stepClick.emit(step.key);
    }
  }
}
