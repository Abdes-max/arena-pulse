import { HttpErrorResponse } from '@angular/common/http';
import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PublicApiService } from 'api-client';
import { Button, Logo } from 'design-system';

type PageState = 'form' | 'sent';

@Component({
  selector: 'app-contact-page',
  imports: [ReactiveFormsModule, RouterLink, Button, Logo],
  templateUrl: './contact.page.html',
  styleUrl: './contact.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly api = inject(PublicApiService);
  private readonly location = inject(Location);

  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    subject: ['', Validators.required],
    message: ['', Validators.required],
  });

  protected readonly state = signal<PageState>('form');
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected goBack(): void {
    this.location.back();
  }

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
        this.errorMessage.set('Trop de messages envoyés, réessayez dans quelques minutes.');
      } else {
        this.errorMessage.set('Une erreur est survenue, réessayez.');
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
