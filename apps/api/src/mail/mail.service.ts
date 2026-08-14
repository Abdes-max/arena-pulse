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
      html: `
        <p>Vous avez été invité·e à rejoindre <strong>${organizationName}</strong> sur TournArena.</p>
        <p><a href="${inviteUrl}">Accepter l'invitation</a></p>
        <p>Ce lien expire dans 7 jours.</p>
      `,
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
      html: `
        <p>Bonjour ${firstName},</p>
        <p>Votre compte organisateur·rice a bien été créé, ainsi que votre organisation <strong>${organizationName}</strong> sur TournArena.</p>
        <p>Vous pouvez dès à présent créer votre premier tournoi depuis votre espace d'administration.</p>
      `,
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
      html: `
        <p>Nous vous confirmons la réception de votre paiement pour la publication du tournoi <strong>${tournamentName}</strong>.</p>
        <p>Montant réglé : <strong>${this.formatAmount(amountCents, currency)}</strong></p>
        <p>Votre tournoi est désormais publié et visible publiquement.</p>
      `,
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
      html: `
        <p>Nous vous confirmons la souscription de <strong>${organizationName}</strong> à l'abonnement annuel TournArena.</p>
        <p>Montant réglé : <strong>${this.formatAmount(amountCents, currency)}</strong></p>
        <p>Votre abonnement est actif jusqu'au <strong>${formattedExpiry}</strong> et couvre la publication de tous vos tournois sur cette période.</p>
      `,
    });
  }

  private formatAmount(amountCents: number, currency: string): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amountCents / 100);
  }
}
