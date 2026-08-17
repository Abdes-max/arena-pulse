import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { Clipboard } from '@capacitor/clipboard';
import { Share } from '@capacitor/share';

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
 * possible falls back to copying the link to the clipboard with a brief
 * "Copié" confirmation.
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
  private copiedTimeout?: ReturnType<typeof setTimeout>;

  protected async share(): Promise<void> {
    try {
      await Share.share({
        title: this.title(),
        text: this.text(),
        url: this.url(),
        dialogTitle: 'Partager',
      });
      return;
    } catch (error) {
      // The visitor dismissed the share sheet -- nothing more to do. Any
      // other failure (e.g. no native share available on this web browser)
      // falls through to the clipboard below instead of failing silently.
      if (this.isCancelled(error)) {
        return;
      }
    }
    await this.copyToClipboard();
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
      await Clipboard.write({ string: this.url() });
      clearTimeout(this.copiedTimeout);
      this.copied.set(true);
      this.copiedTimeout = setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Clipboard unavailable (insecure context, permission denied) -- no
      // further fallback, the visitor can still copy the URL from the
      // address bar themselves.
    }
  }
}
