import { effect, inject, signal, WritableSignal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

// Several filters can change in the same tick (the "reset" button): navigating
// once per filter would cancel all but the last, leaving stale params in the
// URL. Changes are collected per router and flushed in a single navigation.
const pendingByRouter = new WeakMap<Router, Record<string, string | null>>();

function scheduleUrlUpdate(
  router: Router,
  route: ActivatedRoute,
  key: string,
  value: string | null,
): void {
  const pending = pendingByRouter.get(router);
  if (pending) {
    pending[key] = value;
    return;
  }
  pendingByRouter.set(router, { [key]: value });
  queueMicrotask(() => {
    const queryParams = pendingByRouter.get(router) ?? {};
    pendingByRouter.delete(router);
    void router.navigate([], {
      relativeTo: route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });
}

/**
 * A filter value kept in the URL (?key=value): read once at creation, written
 * back (replaceUrl) when it changes, and dropped from the URL while it equals
 * its default -- so a filtered view can be reloaded or shared. Call it from an
 * injection context (a component field initializer).
 */
export function queryFilter<T extends string = string>(
  key: string,
  fallback: NoInfer<T>,
): WritableSignal<T> {
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  const value = signal<T>((route.snapshot.queryParamMap.get(key) as T | null) ?? fallback);

  effect(() => {
    const current = value();
    const inUrl = route.snapshot.queryParamMap.get(key) ?? fallback;
    if (current === inUrl) {
      return;
    }
    scheduleUrlUpdate(router, route, key, current === fallback ? null : current);
  });

  return value;
}
