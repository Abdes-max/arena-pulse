import { TestBed } from '@angular/core/testing';
import { SnackbarService } from './snackbar.service';

describe('SnackbarService', () => {
  it('keeps the last three messages and lets one be dismissed', () => {
    const service = TestBed.inject(SnackbarService);
    service.success('1');
    service.success('2');
    service.error('3');
    service.success('4');

    expect(service.messages().map((message) => message.text)).toEqual(['2', '3', '4']);

    service.dismiss(service.messages()[0].id);
    expect(service.messages().map((message) => message.text)).toEqual(['3', '4']);
  });
});
