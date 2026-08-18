import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it, vi } from 'vitest';
import { QrCode } from './qr-code';

// toDataURL specifically goes through the browser Canvas API under the
// hood (qrcode's CanvasRenderer) -- jsdom (this test environment) has no
// real <canvas> 2D context implementation, so that call would hang/reject
// here regardless of this component's own logic. Mocked the same way
// share-button.spec.ts mocks @capacitor/share: verifying this component
// wires the library's result into `dataUrl` correctly, not re-testing the
// library's own canvas rendering.
const { toDataURLMock } = vi.hoisted(() => ({
  toDataURLMock: vi.fn(),
}));
vi.mock('qrcode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('qrcode')>();
  return { ...actual, toDataURL: toDataURLMock };
});

@Component({
  imports: [QrCode],
  template: `<ap-qr-code [value]="url" [size]="120" />`,
})
class HostComponent {
  url = 'https://tournarena.com/coupe-du-monde-fifa-2026';
}

describe('QrCode', () => {
  it('renders an inline SVG for the given value', async () => {
    toDataURLMock.mockResolvedValue('data:image/png;base64,fake');

    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const svg: SVGSVGElement | null = fixture.nativeElement.querySelector('.ap-qr-code svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('width')).toBe('120');
  });

  it('exposes a downloadable PNG data URL once generated', async () => {
    toDataURLMock.mockResolvedValue('data:image/png;base64,fake');

    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const qrCode = fixture.debugElement.query(By.directive(QrCode)).componentInstance as QrCode;
    expect(qrCode.dataUrl()).toBe('data:image/png;base64,fake');
  });
});
