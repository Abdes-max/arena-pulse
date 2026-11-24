import { TestBed } from '@angular/core/testing';
import { FillBar } from './fill-bar';

describe('FillBar', () => {
  function render(filled: number, total: number, note: string | null = null) {
    const fixture = TestBed.createComponent(FillBar);
    fixture.componentRef.setInput('label', 'Inscriptions U13');
    fixture.componentRef.setInput('filled', filled);
    fixture.componentRef.setInput('total', total);
    fixture.componentRef.setInput('note', note);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the count and fills to the matching width', () => {
    const el = render(12, 16, '4 places restantes');
    expect(el.querySelector('.ap-fill-bar__count')?.textContent?.trim()).toBe('12/16');
    expect((el.querySelector('.ap-fill-bar__fill') as HTMLElement).style.width).toBe('75%');
    expect(el.querySelector('.ap-fill-bar__note')?.textContent).toContain('4 places restantes');
  });

  it('caps the fill at 100% and marks a full bar', () => {
    const el = render(18, 16);
    expect((el.querySelector('.ap-fill-bar__fill') as HTMLElement).style.width).toBe('100%');
    expect(el.querySelector('.ap-fill-bar--full')).not.toBeNull();
    expect(el.querySelector('.ap-fill-bar__note')).toBeNull();
  });
});
