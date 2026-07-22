import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly from = 'Arena Pulse <no-reply@arena-pulse.local>';

  constructor(configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: configService.get<string>('SMTP_HOST', 'localhost'),
      port: configService.get<number>('SMTP_PORT', 1025),
      secure: false,
    });
  }

  async sendInvitationEmail(
    to: string,
    organizationName: string,
    inviteUrl: string,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: `Invitation à rejoindre ${organizationName} sur Arena Pulse`,
      html: `
        <p>Vous avez été invité·e à rejoindre <strong>${organizationName}</strong> sur Arena Pulse.</p>
        <p><a href="${inviteUrl}">Accepter l'invitation</a></p>
        <p>Ce lien expire dans 7 jours.</p>
      `,
    });
  }
}
