import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShareButton } from './share-button';

const { shareMock } = vi.hoisted(() => ({ shareMock: vi.fn() }));
vi.mock('@capacitor/share', () => ({ Share: { share: shareMock } }));

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
    shareMock.mockReset();
    // @ts-expect-error -- test-only cleanup of the property defined below.
    delete navigator.clipboard;
  });

  it('shares through the Capacitor plugin (native sheet on mobile, Web Share API on web)', async () => {
    shareMock.mockResolvedValue(undefined);

    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    button.click();
    await fixture.whenStable();

    expect(shareMock).toHaveBeenCalledWith({
      title: 'Coupe du Monde FIFA 2026',
      text: 'Suivez Coupe du Monde FIFA 2026 sur TournArena',
      url: 'https://tournarena.com/coupe-du-monde-fifa-2026',
      dialogTitle: 'Partager',
    });
  });

  it('falls back to copying the link when sharing fails for a reason other than cancellation', async () => {
    shareMock.mockRejectedValue(new Error('Not implemented on web.'));
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    button.click();
    // A real macrotask (not just whenStable's microtask flush) to let the
    // click handler's two chained awaits (Share.share, then
    // clipboard.writeText) fully settle before the next detectChanges.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(writeTextMock).toHaveBeenCalledWith('https://tournarena.com/coupe-du-monde-fifa-2026');
    expect(button.getAttribute('aria-label')).toBe('Lien copié');
    expect(button.textContent).toContain('Copié');
  });

  it('does not fall back to the clipboard when the visitor cancels the native share sheet', async () => {
    shareMock.mockRejectedValue(new Error('Share canceled'));
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

  it('does not fall back to the clipboard when the Web Share API reports AbortError', async () => {
    shareMock.mockRejectedValue(new DOMException('cancelled', 'AbortError'));
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
