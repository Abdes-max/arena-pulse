import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly contactRecipient: string;
  private readonly logoUrl: string;

  constructor(configService: ConfigService) {
    const port = configService.get<number>('SMTP_PORT', 1025);
    const user = configService.get<string>('SMTP_USER');
    const pass = configService.get<string>('SMTP_PASSWORD');

    this.transporter = nodemailer.createTransport({
      // Default to the literal IPv4 loopback rather than "localhost": on some
      // machines "localhost" resolves to an IPv6 address that isn't actually
      // reachable even though IPv4 loopback is fine, breaking the SMTP
      // connection to Mailhog.
      host: configService.get<string>('SMTP_HOST', '127.0.0.1'),
      port,
      // 465 is implicit TLS (SMTPS); other ports (587, 25) use STARTTLS,
      // which nodemailer negotiates on its own when secure is false.
      secure: port === 465,
      // Only set `auth` when credentials are actually provided -- an auth
      // object with undefined user/pass makes nodemailer attempt SMTP AUTH
      // and fail against relays (e.g. local Mailhog) that don't support it.
      auth: user && pass ? { user, pass } : undefined,
    });
    this.from = configService.get<string>(
      'SMTP_FROM',
      'TournArena <no-reply@arena-pulse.local>',
    );
    // Destination for the public contact form (feat/100). Was temporarily
    // aziaissa@gmail.com until the contact@tournarena.com mailbox existed
    // (task #16); now that it's created, this is the real destination --
    // still overridable via env without a code change if it ever moves again.
    this.contactRecipient = configService.get<string>(
      'CONTACT_RECIPIENT_EMAIL',
      'contact@tournarena.com',
    );
    // Inline <svg> in the header (previous approach) gets stripped by several
    // webmail HTML sanitizers (confirmed: Hostinger/Titan webmail drops it
    // entirely, leaving a blank header cell) -- a plain hosted <img> is the
    // only broadly-compatible way to put a logo in an HTML email. Reuses the
    // same ADMIN_WEB_URL the verify-email/invite links already build on
    // (auth.service.ts, tournaments.service.ts...), so this stays correct
    // in every environment without its own env var.
    const webUrl = configService.get<string>(
      'ADMIN_WEB_URL',
      'http://localhost:4300',
    );
    this.logoUrl = `${webUrl}/mail-logo.png`;
  }

  async sendInvitationEmail(
    to: string,
    organizationName: string,
    inviteUrl: string,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: `Invitation à rejoindre ${organizationName} sur TournArena`,
      html: this.wrapEmail(`
        <p>Vous avez été invité·e à rejoindre <strong>${organizationName}</strong> sur TournArena.</p>
        <p><a href="${inviteUrl}" class="ap-mail-cta">Accepter l'invitation</a></p>
        <p>Ce lien expire dans 7 jours.</p>
      `),
    });
  }

  async sendEmailVerificationEmail(
    to: string,
    firstName: string,
    verifyUrl: string,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Vérifiez votre adresse email — TournArena',
      html: this.wrapEmail(`
        <p>Bonjour ${firstName},</p>
        <p>Encore une étape avant de pouvoir utiliser votre compte organisateur·rice : confirmez que cette adresse email vous appartient bien.</p>
        <p><a href="${verifyUrl}" class="ap-mail-cta">Vérifier mon email</a></p>
        <p>Ce lien expire dans 24 heures.</p>
      `),
    });
  }

  async sendAccountCreatedEmail(
    to: string,
    firstName: string,
    organizationName: string,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Bienvenue sur TournArena',
      html: this.wrapEmail(`
        <p>Bonjour ${firstName},</p>
        <p>Votre compte organisateur·rice a bien été créé, ainsi que votre organisation <strong>${organizationName}</strong> sur TournArena.</p>
        <p>Vous pouvez dès à présent créer votre premier tournoi depuis votre espace d'administration.</p>
      `),
    });
  }

  async sendPublicationReceiptEmail(
    to: string,
    tournamentName: string,
    amountCents: number,
    currency: string,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: `Reçu de paiement — Publication de ${tournamentName}`,
      html: this.wrapEmail(`
        <p>Nous vous confirmons la réception de votre paiement pour la publication du tournoi <strong>${tournamentName}</strong>.</p>
        <p>Montant réglé : <strong>${this.formatAmount(amountCents, currency)}</strong></p>
        <p>Votre tournoi est désormais publié et visible publiquement.</p>
      `),
    });
  }

  async sendSubscriptionReceiptEmail(
    to: string,
    organizationName: string,
    amountCents: number,
    currency: string,
    expiresAt: Date,
  ): Promise<void> {
    const formattedExpiry = new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'long',
    }).format(expiresAt);
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Confirmation de votre abonnement annuel TournArena',
      html: this.wrapEmail(`
        <p>Nous vous confirmons la souscription de <strong>${organizationName}</strong> à l'abonnement annuel TournArena.</p>
        <p>Montant réglé : <strong>${this.formatAmount(amountCents, currency)}</strong></p>
        <p>Votre abonnement est actif jusqu'au <strong>${formattedExpiry}</strong> et couvre la publication de tous vos tournois sur cette période.</p>
      `),
    });
  }

  async sendContactMessage(data: {
    name: string;
    email: string;
    subject: string;
    message: string;
  }): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: this.contactRecipient,
      // Lets hitting "Reply" in the mail client go straight back to the
      // visitor instead of to no-reply@ -- this.from stays the fixed
      // TournArena sender identity, only the reply target changes.
      replyTo: `${data.name} <${data.email}>`,
      subject: `[Contact TournArena] ${data.subject}`,
      html: this.wrapEmail(`
        <p><strong>De :</strong> ${this.escapeHtml(data.name)} (${this.escapeHtml(data.email)})</p>
        <p><strong>Sujet :</strong> ${this.escapeHtml(data.subject)}</p>
        <p style="white-space: pre-wrap;">${this.escapeHtml(data.message)}</p>
      `),
    });
  }

  // The 4 email templates above only ever interpolate values the product
  // itself generated (org/tournament names entered by an authenticated
  // organizer, amounts, dates) -- this one interpolates raw text typed by an
  // anonymous visitor into an HTML email body, so it needs actual escaping.
  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private formatAmount(amountCents: number, currency: string): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amountCents / 100);
  }

  // Wraps every email's body in the fixed "Ink & Signal" product identity
  // (docs/design/brand-foundations.md -- distinct from the 3 selectable
  // tournament themes, this one never changes). Table-based layout for
  // email client compatibility; the mark is a hosted <img> (see this.logoUrl
  // -- generated from docs/design/brand/mark-on-light.svg, see
  // apps/web/public/mail-logo.png), not an inline <svg>, which several
  // webmail sanitizers strip outright. The font stack falls back to the same
  // system fonts the product itself falls back to
  // (libs/design-tokens/src/styles/_ink-signal.scss) since webfonts don't
  // reliably load in mail clients. Full doctype/head/meta-charset (rather
  // than a bare table fragment) so clients that sniff the HTML for encoding
  // instead of trusting the MIME Content-Type header still get it right.
  private wrapEmail(bodyHtml: string): string {
    // Inlined directly on the <a> rather than via a <style> block + class --
    // some webmail sanitizers (confirmed: Hostinger/Titan) strip <style>
    // tags entirely, which would leave CTA buttons completely unstyled.
    const ctaStyle =
      'display:inline-block;background:#1e293b;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;';
    return `
      <!doctype html>
      <html lang="fr">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </head>
        <body style="margin:0;padding:0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
                  <tr>
                    <td style="padding:24px 32px;border-bottom:1px solid #e2e8f0;">
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="padding-right:10px;">
                            <img src="${this.logoUrl}" width="28" height="28" alt="TournArena" style="display:block;border:0;" />
                          </td>
                          <td style="font-family:'Space Grotesk',-apple-system,'Segoe UI',sans-serif;font-size:20px;font-weight:700;letter-spacing:-0.02em;">
                            <span style="color:#1e293b;">Tourn</span><span style="color:#0a738d;">Arena</span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:24px 32px;font-family:'Inter',-apple-system,'Segoe UI',sans-serif;color:#1e293b;font-size:15px;line-height:1.6;">
                      ${bodyHtml.replace(/class="ap-mail-cta"/g, `style="${ctaStyle}"`)}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 32px 24px;font-family:'Inter',-apple-system,'Segoe UI',sans-serif;color:#64748b;font-size:12px;">
                      TournArena — le pouls de la compétition
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }
}
