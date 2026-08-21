import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../mail/mail.service';

// kelto-studio.fr itself (see sites/kelto-studio/, deliberately no
// JavaScript at all -- infra/deployment/Caddyfile's CSP comment on that
// site block) rather than the api's own ADMIN_WEB_URL-derived origin,
// since redirects here always send the visitor's browser back to that
// static site, never to anything under tournarena.com.
const KELTO_SITE_ORIGIN = 'https://kelto-studio.fr';

// Keys must match the <select>/radio values in sites/kelto-studio/index.html's
// contact form exactly -- this is the one place both sides of that contract
// are declared (the form has no client-side script to keep in sync with).
const REQUEST_TYPE_LABELS: Record<string, string> = {
  projet_devis: 'Projet / devis',
  probleme: 'Problème rencontré',
  autre: 'Autre',
};

export interface KeltoContactFields {
  nom: string;
  email: string;
  typeDemande: string;
  message: string;
}

@Injectable()
export class KeltoContactService {
  private readonly logger = new Logger(KeltoContactService.name);

  constructor(private readonly mailService: MailService) {}

  // Returns the URL the controller should redirect the visitor's browser to
  // -- this is a plain HTML <form method="post"> submission (real
  // cross-origin navigation, no fetch/XHR involved since the page ships no
  // JS), so every outcome has to be expressed as "where does the browser go
  // next", never a JSON body nothing on that page could read.
  async handleSubmission(body: Record<string, unknown>): Promise<string> {
    // Honeypot -- see the form markup (name="site_web", visually hidden off
    // -screen + aria-hidden, not display:none since some crawlers skip
    // display:none fields specifically). A real visitor never populates it;
    // any non-empty value means something filled in every field
    // indiscriminately. Redirect to the same success page as a genuine
    // submission -- giving a bot a different outcome would teach it that
    // this field is being checked.
    if (this.isNonEmptyString(body.site_web)) {
      this.logger.warn(
        'Kelto contact form honeypot triggered, discarding submission',
      );
      return `${KELTO_SITE_ORIGIN}/merci.html`;
    }

    const fields = this.parseFields(body);
    if (!fields) {
      return `${KELTO_SITE_ORIGIN}/#contact-erreur`;
    }

    await this.mailService.sendKeltoContactMessage({
      nom: fields.nom,
      email: fields.email,
      typeDemandeLabel: REQUEST_TYPE_LABELS[fields.typeDemande],
      message: fields.message,
    });

    return `${KELTO_SITE_ORIGIN}/merci.html`;
  }

  // Deliberately not a class-validator DTO + ValidationPipe here (unlike
  // every other endpoint in this app) -- a validation failure needs to
  // become a redirect back to the form, not the global pipe's JSON 400,
  // which a script-less static page has no way to display. Doing the
  // checks by hand keeps that redirect entirely under this method's
  // control.
  private parseFields(
    body: Record<string, unknown>,
  ): KeltoContactFields | null {
    const nom = this.clean(body.nom, 120);
    const email = this.clean(body.email, 200);
    const typeDemande = this.clean(body.typeDemande, 40);
    const message = this.clean(body.message, 5000);

    if (
      nom.length === 0 ||
      !this.isValidEmail(email) ||
      !Object.prototype.hasOwnProperty.call(REQUEST_TYPE_LABELS, typeDemande) ||
      message.length === 0
    ) {
      return null;
    }

    return { nom, email, typeDemande, message };
  }

  private isNonEmptyString(value: unknown): boolean {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private clean(value: unknown, maxLength: number): string {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, maxLength);
  }

  // Deliberately simple (no full RFC 5322 parser) -- this only gates which
  // redirect the visitor gets, and the HTML input already has type="email"
  // for real browsers; the actual delivery risk is handled by nodemailer/
  // SMTP itself if the address turns out not to exist.
  private isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 200;
  }
}
