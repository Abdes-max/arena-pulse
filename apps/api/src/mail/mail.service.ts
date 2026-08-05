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
}
