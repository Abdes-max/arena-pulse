import { ChangeDetectionStrategy, Component, WritableSignal, input, signal } from '@angular/core';
import { Clipboard } from '@capacitor/clipboard';
import { Share } from '@capacitor/share';

// If the native bridge never resolves Share.share or Clipboard.write (e.g.
// a permission prompt neither can dismiss on its own -- confirmed directly:
// a clipboard-write permission query hung indefinitely in one browser
// automation context during testing, no rejection, no console output, ever)
// awaiting either directly would hang forever -- the button would tap and
// nothing would ever visibly happen, with no way to tell a genuine hang
// apart from "still working". Racing each against this timeout guarantees
// the clipboard fallback, or a visible failure, always shows up within a
// bounded time instead.
const BRIDGE_TIMEOUT_MS = 5000;

/**
 * Share button for the top-right of a tournament header (mobile app, mobile
 * web, and desktop web). Purely self-contained, unlike ap-theme-mode-toggle:
 * there's no equivalent of ThemeService to delegate to, so the component
 * owns the whole share flow itself.
 *
 * Goes through @capacitor/share rather than calling navigator.share
 * directly: its native iOS/Android implementations invoke the OS's own full
 * share sheet through the Capacitor bridge (every installed app, AirDrop,
 * Messages, Mail, Copy...) -- more reliable inside a WKWebView/Capacitor
 * shell than the raw Web Share API, which can be inconsistently available
 * there. On the web (desktop or mobile browser), the plugin's own web
 * implementation is a thin wrapper over navigator.share, so this still
 * degrades to the same behaviour there. Either way, sharing that isn't
 * possible falls back to copying the link to the clipboard -- and if even
 * that fails, a brief "Échec" state instead of nothing, so a tap always
 * visibly does *something* (both states also console.error the underlying
 * reason, for remote debugging via Safari's Web Inspector).
 */
@Component({
  selector: 'ap-share-button',
  imports: [],
  templateUrl: './share-button.html',
  styleUrl: './share-button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareButton {
  readonly title = input.required<string>();
  readonly text = input<string>();
  readonly url = input.required<string>();

  protected readonly copied = signal(false);
  protected readonly failed = signal(false);
  private feedbackTimeout?: ReturnType<typeof setTimeout>;

  // Public wrapper around the (protected, template-bound) share() -- lets a
  // parent that wraps this button in a larger clickable surface (e.g. a
  // full settings row, where the visible icon is only part of the tap
  // target) trigger the same share flow via a template reference, instead
  // of duplicating the timeout/clipboard-fallback/failure-state logic.
  async triggerShare(): Promise<void> {
    return this.share();
  }

  protected async share(): Promise<void> {
    try {
      await this.withTimeout(
        Share.share({
          title: this.title(),
          text: this.text(),
          url: this.url(),
          dialogTitle: 'Partager',
        }),
        BRIDGE_TIMEOUT_MS,
        'Share.share',
      );
      return;
    } catch (error) {
      // The visitor dismissed the share sheet -- nothing more to do. Any
      // other failure (e.g. no native share available on this web browser,
      // or the bridge call above timing out) falls through to the
      // clipboard below instead of failing silently.
      if (this.isCancelled(error)) {
        return;
      }
      console.error('[ap-share-button] Share.share failed:', error);
    }
    await this.copyToClipboard();
  }

  // Clears its own timer once the race is decided either way -- without
  // this, a promise that settles well before the deadline (the overwhelmingly
  // common case: a real share/cancel, not a hang) would still leave its
  // timeout scheduled, rejecting an already-settled race later with nothing
  // listening -- an unhandled rejection days after the fact, not just a
  // wasted timer.
  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeout = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
  }

  // Capacitor's native implementations reject with a plain Error whose
  // message says the share was cancelled; the plugin's web implementation
  // (wrapping navigator.share) rejects with a DOMException named
  // AbortError instead. Both mean "changed their mind", not "failed".
  private isCancelled(error: unknown): boolean {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return true;
    }
    const message = error instanceof Error ? error.message : String(error);
    return /cancel/i.test(message);
  }

  // @capacitor/clipboard, not navigator.clipboard.writeText directly, for
  // the same reason as @capacitor/share above: the raw Clipboard API is
  // unreliable inside a Capacitor WKWebView (permission prompts that never
  // resolve, or a silent no-op) -- the plugin's native implementations
  // write to the OS clipboard directly, and its web implementation still
  // wraps navigator.clipboard.writeText, so browser behaviour is unchanged.
  private async copyToClipboard(): Promise<void> {
    try {
      await this.withTimeout(
        Clipboard.write({ string: this.url() }),
        BRIDGE_TIMEOUT_MS,
        'Clipboard.write',
      );
      this.showFeedback(this.copied);
    } catch (error) {
      console.error('[ap-share-button] Clipboard.write failed:', error);
      this.showFeedback(this.failed);
    }
  }

  private showFeedback(state: WritableSignal<boolean>): void {
    clearTimeout(this.feedbackTimeout);
    this.copied.set(false);
    this.failed.set(false);
    state.set(true);
    this.feedbackTimeout = setTimeout(() => state.set(false), 2500);
  }
}
