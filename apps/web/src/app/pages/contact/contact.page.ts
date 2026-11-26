import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PublicApiService } from 'api-client';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Logo } from 'design-system';

type PageState = 'form' | 'sent';

@Component({
  selector: 'app-contact-page',
  imports: [ReactiveFormsModule, RouterLink, Button, Logo, TranslocoPipe],
  templateUrl: './contact.page.html',
  styleUrl: './contact.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly api = inject(PublicApiService);

  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    subject: ['', Validators.required],
    message: ['', Validators.required],
  });

  protected readonly state = signal<PageState>('form');
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      await this.api.sendContactMessage(this.form.getRawValue());
      this.state.set('sent');
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 429) {
        this.errorMessage.set('contact.tooMany');
      } else {
        this.errorMessage.set('contact.error');
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
