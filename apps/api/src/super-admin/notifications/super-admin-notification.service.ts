import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';

export type SuperAdminPaymentKind =
  'publication' | 'subscription' | 'registration';

const PAYMENT_KIND_LABEL: Record<SuperAdminPaymentKind, string> = {
  publication: 'Publication de tournoi',
  subscription: 'Abonnement annuel',
  registration: "Inscription d'équipe",
};

/**
 * Emails to every super-admin account when something worth knowing happens
 * on the platform: an organization or a tournament is created, a tournament
 * is published, a payment comes in.
 *
 * Every method is fire-and-forget and never throws: a notification must not
 * break (or slow down, beyond the awaited DB read) the organizer's own
 * action, so failures are only logged.
 */
@Injectable()
export class SuperAdminNotificationService {
  private readonly logger = new Logger(SuperAdminNotificationService.name);
  private readonly consoleUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    configService: ConfigService,
  ) {
    this.consoleUrl = `${configService.get<string>('ADMIN_WEB_URL', 'http://localhost:4300')}/super-admin`;
  }

  organizationCreated(data: {
    organizationId: string;
    organizationName: string;
    adminName: string;
    adminEmail: string;
  }): Promise<void> {
    return this.notify({
      subject: `Nouvelle organisation : ${data.organizationName}`,
      title: 'Une organisation vient d’être créée',
      rows: [
        { label: 'Organisation', value: data.organizationName },
        {
          label: 'Administrateur',
          value: `${data.adminName} (${data.adminEmail})`,
        },
      ],
      link: {
        url: `${this.consoleUrl}/organizations/${data.organizationId}`,
        label: 'Voir l’organisation',
      },
    });
  }

  tournamentCreated(data: {
    tournamentId: string;
    tournamentName: string;
    organizationName: string;
    sportName: string;
  }): Promise<void> {
    return this.notify({
      subject: `Nouveau tournoi : ${data.tournamentName}`,
      title: 'Un tournoi vient d’être créé',
      rows: [
        { label: 'Tournoi', value: data.tournamentName },
        { label: 'Organisation', value: data.organizationName },
        { label: 'Sport', value: data.sportName },
      ],
      link: {
        url: `${this.consoleUrl}/tournaments/${data.tournamentId}`,
        label: 'Voir le tournoi',
      },
    });
  }

  tournamentPublished(data: {
    tournamentId: string;
    tournamentName: string;
    organizationName: string;
  }): Promise<void> {
    return this.notify({
      subject: `Tournoi publié : ${data.tournamentName}`,
      title: 'Un tournoi vient d’être publié',
      rows: [
        { label: 'Tournoi', value: data.tournamentName },
        { label: 'Organisation', value: data.organizationName },
      ],
      link: {
        url: `${this.consoleUrl}/tournaments/${data.tournamentId}`,
        label: 'Voir le tournoi',
      },
    });
  }

  /** Free (0 cent) payments are not notified: nothing was actually paid. */
  paymentReceived(data: {
    kind: SuperAdminPaymentKind;
    amountCents: number;
    currency: string;
    organizationName: string;
    detail?: string;
  }): Promise<void> {
    if (data.amountCents <= 0) {
      return Promise.resolve();
    }
    const amount = new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: data.currency.toUpperCase(),
    }).format(data.amountCents / 100);
    return this.notify({
      subject: `Paiement reçu : ${amount} (${PAYMENT_KIND_LABEL[data.kind]})`,
      title: 'Un paiement vient d’être encaissé',
      rows: [
        { label: 'Type', value: PAYMENT_KIND_LABEL[data.kind] },
        { label: 'Montant', value: amount },
        { label: 'Organisation', value: data.organizationName },
        ...(data.detail ? [{ label: 'Détail', value: data.detail }] : []),
      ],
      link: { url: `${this.consoleUrl}/payments`, label: 'Voir les paiements' },
    });
  }

  private async notify(
    notification: Parameters<MailService['sendSuperAdminNotification']>[1],
  ): Promise<void> {
    try {
      const accounts = await this.prisma.superAdminAccount.findMany({
        select: { email: true },
      });
      for (const { email } of accounts) {
        try {
          await this.mailService.sendSuperAdminNotification(
            email,
            notification,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to send super-admin notification to ${email}: ${(error as Error).message}`,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to send super-admin notification "${notification.subject}": ${(error as Error).message}`,
      );
    }
  }
}
