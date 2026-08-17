import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';

/**
 * Share button for the top-right of a tournament header (mobile app, mobile
 * web, and desktop web). Purely self-contained, unlike ap-theme-mode-toggle:
 * there's no equivalent of ThemeService to delegate to, so the component
 * owns the whole share flow itself -- native share sheet (Web Share API)
 * when available, falling back to copying the link to the clipboard with a
 * brief "Copié" confirmation otherwise.
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
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: this.title(), text: this.text(), url: this.url() });
        return;
      } catch (error) {
        // AbortError -- the visitor cancelled the native share sheet, nothing
        // more to do. Any other failure (e.g. no share target installed)
        // falls through to the clipboard below instead of failing silently.
        if ((error as DOMException)?.name === 'AbortError') {
          return;
        }
      }
    }
    await this.copyToClipboard();
  }

  private async copyToClipboard(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url());
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
