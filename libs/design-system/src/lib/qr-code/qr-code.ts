import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { toDataURL, toString as qrToString } from 'qrcode';

/**
 * Renders a scannable QR code for `value` -- entirely client-side (no
 * backend round-trip, the value is already known wherever this is used,
 * e.g. a tournament's public URL). Two representations are generated in
 * parallel: an inline SVG (crisp at any CSS size, what's actually shown)
 * and a higher-resolution PNG data URL (exposed via `dataUrl` for a
 * consumer to build a download link from -- an SVG-to-PNG conversion isn't
 * needed since the `qrcode` library renders each format independently from
 * the same source data).
 *
 * Colors are hardcoded black-on-white regardless of the app's light/dark
 * theme -- a QR code needs reliable scan contrast more than it needs to
 * match the surrounding page, and inverting it under dark mode (light
 * modules on a dark background) is exactly the kind of "looks fine, scans
 * badly" mistake worth avoiding outright.
 */
@Component({
  selector: 'ap-qr-code',
  imports: [],
  templateUrl: './qr-code.html',
  styleUrl: './qr-code.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrCode {
  readonly value = input.required<string>();
  // CSS pixel size the SVG renders at -- the PNG (see dataUrl) is generated
  // at a higher resolution regardless (see DOWNLOAD_SCALE below), since a
  // printed/downloaded copy benefits from more pixels than an on-screen
  // preview needs.
  readonly size = input(200);

  private readonly sanitizer = inject(DomSanitizer);

  protected readonly svgMarkup = signal<SafeHtml | null>(null);
  protected readonly failed = signal(false);
  // Public: consumers (e.g. a download link) read this directly rather than
  // through a protected/template-only member.
  readonly dataUrl = signal<string | null>(null);

  private static readonly DOWNLOAD_SCALE = 4;

  constructor() {
    effect(() => {
      const value = this.value();
      const size = this.size();
      const colorOptions = { color: { dark: '#000000ff', light: '#ffffffff' }, margin: 1 };

      this.failed.set(false);
      this.svgMarkup.set(null);
      this.dataUrl.set(null);

      qrToString(value, { ...colorOptions, type: 'svg', width: size })
        .then((svg) => this.svgMarkup.set(this.sanitizer.bypassSecurityTrustHtml(svg)))
        .catch((error: unknown) => {
          console.error('[ap-qr-code] Failed to render SVG:', error);
          this.failed.set(true);
        });

      toDataURL(value, { ...colorOptions, width: size * QrCode.DOWNLOAD_SCALE })
        .then((url) => this.dataUrl.set(url))
        .catch((error: unknown) => {
          // Non-fatal on its own -- the SVG preview above still renders;
          // only the download link ends up unavailable.
          console.error('[ap-qr-code] Failed to render PNG data URL:', error);
        });
    });
  }
}
