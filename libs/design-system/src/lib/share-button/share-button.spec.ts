import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShareButton } from './share-button';

@Component({
  imports: [ShareButton],
  template: `<ap-share-button [title]="title" [text]="text" [url]="url" />`,
})
class HostComponent {
  title = 'Coupe du Monde FIFA 2026';
  text = 'Suivez Coupe du Monde FIFA 2026 sur TournArena';
  url = 'https://tournarena.com/coupe-du-monde-fifa-2026';
}

describe('ShareButton', () => {
  afterEach(() => {
    // @ts-expect-error -- test-only cleanup of the properties defined below.
    delete navigator.share;
    // @ts-expect-error -- test-only cleanup of the properties defined below.
    delete navigator.clipboard;
  });

  it('uses the native share sheet when available', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true });

    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    button.click();
    await fixture.whenStable();

    expect(shareMock).toHaveBeenCalledWith({
      title: 'Coupe du Monde FIFA 2026',
      text: 'Suivez Coupe du Monde FIFA 2026 sur TournArena',
      url: 'https://tournarena.com/coupe-du-monde-fifa-2026',
    });
  });

  it('falls back to copying the link when the Web Share API is unavailable', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(writeTextMock).toHaveBeenCalledWith('https://tournarena.com/coupe-du-monde-fifa-2026');
    expect(button.getAttribute('aria-label')).toBe('Lien copié');
    expect(button.textContent).toContain('Copié');
  });

  it('does not fall back to the clipboard when the visitor cancels the native share sheet', async () => {
    const shareMock = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    button.click();
    await fixture.whenStable();

    expect(writeTextMock).not.toHaveBeenCalled();
  });
});
