import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly from: string;

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

  private formatAmount(amountCents: number, currency: string): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amountCents / 100);
  }

  // Wraps every email's body in the fixed "Ink & Signal" product identity
  // (docs/design/brand-foundations.md -- distinct from the 3 selectable
  // tournament themes, this one never changes). Table-based layout for
  // email client compatibility; no external font/asset requests -- the mark
  // is the small inline SVG already used standalone at
  // docs/design/brand/mark-on-light.svg, and the font stack falls back to
  // the same system fonts the product itself falls back to
  // (libs/design-tokens/src/styles/_ink-signal.scss) since webfonts don't
  // reliably load in mail clients.
  private wrapEmail(bodyHtml: string): string {
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
              <tr>
                <td style="padding:24px 32px;border-bottom:1px solid #e2e8f0;">
                  <table role="presentation" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding-right:10px;">
                        <svg width="28" height="28" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
                          <rect x="2" y="2" width="60" height="60" rx="14" fill="#1e293b" />
                          <path d="M22 16 L42 32 L22 48" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
                          <circle cx="45" cy="32" r="10" fill="#0ea5c9" opacity="0.22" />
                          <circle cx="45" cy="32" r="5.5" fill="#0ea5c9" />
                        </svg>
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
                  <style>.ap-mail-cta { display: inline-block; background: #1e293b; color: #ffffff !important; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; }</style>
                  ${bodyHtml}
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
    `;
  }
}
