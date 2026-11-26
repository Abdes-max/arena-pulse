import { EnvironmentProviders, InjectionToken, Provider, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { map, switchMap } from 'rxjs';

/** Every design-system label an app can translate (see DESIGN_SYSTEM_LABEL). */
export type DesignSystemLabelKey =
  | 'upcoming'
  | 'live'
  | 'finished'
  | 'postponed'
  | 'cancelled'
  | 'qualified'
  | 'eliminated'
  | 'draft'
  | 'published'
  | 'unpublished'
  | 'archived'
  | 'forfeit'
  | 'share'
  | 'linkCopied'
  | 'shareFailed'
  | 'copied'
  | 'failed';

/**
 * The app's own labels for the design-system components (badge statuses,
 * "forfeit", the share button), in its active language -- undefined falls
 * back to their French defaults. Reading a signal inside keeps them in step
 * with a language switch. Lives here rather than in design-system so an app
 * can provide it without pulling that whole library into its first bundle.
 */
export const DESIGN_SYSTEM_LABEL = new InjectionToken<
  (key: DesignSystemLabelKey) => string | undefined
>('DESIGN_SYSTEM_LABEL');

/**
 * DESIGN_SYSTEM_LABEL from the app's `designSystem` Transloco keys -- once
 * the active language's file is loaded, the French defaults until then.
 */
export function provideDesignSystemLabels(): (Provider | EnvironmentProviders)[] {
  return [
    {
      provide: DESIGN_SYSTEM_LABEL,
      useFactory: () => {
        const transloco = inject(TranslocoService);
        const loadedLang = toSignal(
          transloco.langChanges$.pipe(
            switchMap((lang) => transloco.load(lang).pipe(map(() => lang))),
          ),
          { initialValue: null },
        );
        return (key: DesignSystemLabelKey) => {
          const lang = loadedLang();
          if (!lang) {
            return undefined;
          }
          const text = transloco.translate(`designSystem.${key}`, {}, lang);
          return text === `designSystem.${key}` ? undefined : text;
        };
      },
    },
  ];
}
