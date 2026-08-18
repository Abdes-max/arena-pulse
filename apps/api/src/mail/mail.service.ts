import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import { DEFAULT_MAIL_LANGUAGE, MailLanguage } from './mail-language';

interface MailCopy {
  greeting: (firstName: string) => string;
  invitationSubject: (organizationName: string) => string;
  invitationIntro: (organizationName: string) => string;
  invitationCta: string;
  invitationExpiry: string;
  verifySubject: string;
  verifyIntro: string;
  verifyCta: string;
  verifyExpiry: string;
  welcomeSubject: string;
  welcomeBody1: (organizationName: string) => string;
  welcomeBody2: string;
  publicationReceiptSubject: (tournamentName: string) => string;
  publicationReceiptBody1: (tournamentName: string) => string;
  amountPaidLabel: string;
  publicationReceiptBody2: string;
  subscriptionReceiptSubject: string;
  subscriptionReceiptBody1: (organizationName: string) => string;
  subscriptionReceiptBody2: (formattedExpiry: string) => string;
  footerTagline: string;
}

// Same 6 languages, same tone/register choices already made for the
// frontend's own admin.* i18n JSON (libs/design-tokens's LanguageService):
// formal "Sie" in German, informal register in Spanish/Italian/Portuguese,
// neutral in English (no T-V distinction to make). Kept as plain template
// functions here rather than a nested i18n key structure (like the
// frontend's transloco JSON) since this is the only place these strings are
// used -- a full i18n library would be overkill for 6 short emails.
const MAIL_COPY: Record<MailLanguage, MailCopy> = {
  fr: {
    greeting: (firstName) => `Bonjour ${firstName},`,
    invitationSubject: (org) => `Invitation à rejoindre ${org} sur TournArena`,
    invitationIntro: (org) =>
      `Vous avez été invité·e à rejoindre <strong>${org}</strong> sur TournArena.`,
    invitationCta: "Accepter l'invitation",
    invitationExpiry: 'Ce lien expire dans 7 jours.',
    verifySubject: 'Vérifiez votre adresse email — TournArena',
    verifyIntro:
      'Encore une étape avant de pouvoir utiliser votre compte organisateur·rice : confirmez que cette adresse email vous appartient bien.',
    verifyCta: 'Vérifier mon email',
    verifyExpiry: 'Ce lien expire dans 24 heures.',
    welcomeSubject: 'Bienvenue sur TournArena',
    welcomeBody1: (org) =>
      `Votre compte organisateur·rice a bien été créé, ainsi que votre organisation <strong>${org}</strong> sur TournArena.`,
    welcomeBody2:
      "Vous pouvez dès à présent créer votre premier tournoi depuis votre espace d'administration.",
    publicationReceiptSubject: (name) =>
      `Reçu de paiement — Publication de ${name}`,
    publicationReceiptBody1: (name) =>
      `Nous vous confirmons la réception de votre paiement pour la publication du tournoi <strong>${name}</strong>.`,
    amountPaidLabel: 'Montant réglé :',
    publicationReceiptBody2:
      'Votre tournoi est désormais publié et visible publiquement.',
    subscriptionReceiptSubject:
      'Confirmation de votre abonnement annuel TournArena',
    subscriptionReceiptBody1: (org) =>
      `Nous vous confirmons la souscription de <strong>${org}</strong> à l'abonnement annuel TournArena.`,
    subscriptionReceiptBody2: (expiry) =>
      `Votre abonnement est actif jusqu'au <strong>${expiry}</strong> et couvre la publication de tous vos tournois sur cette période.`,
    footerTagline: 'TournArena — le pouls de la compétition',
  },
  en: {
    greeting: (firstName) => `Hi ${firstName},`,
    invitationSubject: (org) => `Invitation to join ${org} on TournArena`,
    invitationIntro: (org) =>
      `You've been invited to join <strong>${org}</strong> on TournArena.`,
    invitationCta: 'Accept invitation',
    invitationExpiry: 'This link expires in 7 days.',
    verifySubject: 'Verify your email — TournArena',
    verifyIntro:
      'One more step before you can use your organizer account: confirm that this email address is yours.',
    verifyCta: 'Verify my email',
    verifyExpiry: 'This link expires in 24 hours.',
    welcomeSubject: 'Welcome to TournArena',
    welcomeBody1: (org) =>
      `Your organizer account has been created, along with your organization <strong>${org}</strong> on TournArena.`,
    welcomeBody2:
      'You can now create your first tournament from your admin dashboard.',
    publicationReceiptSubject: (name) => `Payment receipt — Publishing ${name}`,
    publicationReceiptBody1: (name) =>
      `We confirm receipt of your payment for publishing the tournament <strong>${name}</strong>.`,
    amountPaidLabel: 'Amount paid:',
    publicationReceiptBody2:
      'Your tournament is now published and publicly visible.',
    subscriptionReceiptSubject:
      'Your TournArena annual subscription confirmation',
    subscriptionReceiptBody1: (org) =>
      `We confirm <strong>${org}</strong>'s subscription to the TournArena annual plan.`,
    subscriptionReceiptBody2: (expiry) =>
      `Your subscription is active until <strong>${expiry}</strong> and covers publishing all your tournaments during this period.`,
    footerTagline: 'TournArena — the pulse of competition',
  },
  es: {
    greeting: (firstName) => `Hola ${firstName},`,
    invitationSubject: (org) => `Invitación para unirte a ${org} en TournArena`,
    invitationIntro: (org) =>
      `Te han invitado a unirte a <strong>${org}</strong> en TournArena.`,
    invitationCta: 'Aceptar la invitación',
    invitationExpiry: 'Este enlace caduca en 7 días.',
    verifySubject: 'Verifica tu correo electrónico — TournArena',
    verifyIntro:
      'Un paso más antes de poder usar tu cuenta de organizador·a: confirma que esta dirección de correo te pertenece.',
    verifyCta: 'Verificar mi correo',
    verifyExpiry: 'Este enlace caduca en 24 horas.',
    welcomeSubject: 'Bienvenido a TournArena',
    welcomeBody1: (org) =>
      `Tu cuenta de organizador·a se ha creado correctamente, junto con tu organización <strong>${org}</strong> en TournArena.`,
    welcomeBody2:
      'Ya puedes crear tu primer torneo desde tu panel de administración.',
    publicationReceiptSubject: (name) =>
      `Recibo de pago — Publicación de ${name}`,
    publicationReceiptBody1: (name) =>
      `Confirmamos la recepción de tu pago para la publicación del torneo <strong>${name}</strong>.`,
    amountPaidLabel: 'Importe pagado:',
    publicationReceiptBody2:
      'Tu torneo ya está publicado y visible públicamente.',
    subscriptionReceiptSubject:
      'Confirmación de tu suscripción anual TournArena',
    subscriptionReceiptBody1: (org) =>
      `Confirmamos la suscripción de <strong>${org}</strong> al plan anual de TournArena.`,
    subscriptionReceiptBody2: (expiry) =>
      `Tu suscripción está activa hasta el <strong>${expiry}</strong> y cubre la publicación de todos tus torneos durante ese período.`,
    footerTagline: 'TournArena — el pulso de la competición',
  },
  de: {
    greeting: (firstName) => `Hallo ${firstName},`,
    invitationSubject: (org) => `Einladung, ${org} auf TournArena beizutreten`,
    invitationIntro: (org) =>
      `Sie wurden eingeladen, <strong>${org}</strong> auf TournArena beizutreten.`,
    invitationCta: 'Einladung annehmen',
    invitationExpiry: 'Dieser Link läuft in 7 Tagen ab.',
    verifySubject: 'Bestätigen Sie Ihre E-Mail-Adresse — TournArena',
    verifyIntro:
      'Noch ein Schritt, bevor Sie Ihr Organisator·innen-Konto nutzen können: Bestätigen Sie, dass diese E-Mail-Adresse Ihnen gehört.',
    verifyCta: 'Meine E-Mail bestätigen',
    verifyExpiry: 'Dieser Link läuft in 24 Stunden ab.',
    welcomeSubject: 'Willkommen bei TournArena',
    welcomeBody1: (org) =>
      `Ihr Organisator·innen-Konto wurde erstellt, ebenso wie Ihre Organisation <strong>${org}</strong> auf TournArena.`,
    welcomeBody2:
      'Sie können jetzt Ihr erstes Turnier über Ihren Admin-Bereich erstellen.',
    publicationReceiptSubject: (name) =>
      `Zahlungsbeleg — Veröffentlichung von ${name}`,
    publicationReceiptBody1: (name) =>
      `Wir bestätigen den Eingang Ihrer Zahlung für die Veröffentlichung des Turniers <strong>${name}</strong>.`,
    amountPaidLabel: 'Bezahlter Betrag:',
    publicationReceiptBody2:
      'Ihr Turnier ist nun veröffentlicht und öffentlich sichtbar.',
    subscriptionReceiptSubject:
      'Bestätigung Ihres TournArena-Jahresabonnements',
    subscriptionReceiptBody1: (org) =>
      `Wir bestätigen den Abschluss des TournArena-Jahresabonnements für <strong>${org}</strong>.`,
    subscriptionReceiptBody2: (expiry) =>
      `Ihr Abonnement ist bis zum <strong>${expiry}</strong> aktiv und deckt die Veröffentlichung aller Ihrer Turniere in diesem Zeitraum ab.`,
    footerTagline: 'TournArena — der Puls des Wettbewerbs',
  },
  it: {
    greeting: (firstName) => `Ciao ${firstName},`,
    invitationSubject: (org) => `Invito a unirti a ${org} su TournArena`,
    invitationIntro: (org) =>
      `Sei stato invitato a unirti a <strong>${org}</strong> su TournArena.`,
    invitationCta: "Accetta l'invito",
    invitationExpiry: 'Questo link scade tra 7 giorni.',
    verifySubject: 'Verifica la tua email — TournArena',
    verifyIntro:
      'Ancora un passo prima di poter usare il tuo account organizzatore·rice: conferma che questo indirizzo email è tuo.',
    verifyCta: 'Verifica la mia email',
    verifyExpiry: 'Questo link scade tra 24 ore.',
    welcomeSubject: 'Benvenuto su TournArena',
    welcomeBody1: (org) =>
      `Il tuo account organizzatore·rice è stato creato, insieme alla tua organizzazione <strong>${org}</strong> su TournArena.`,
    welcomeBody2:
      'Puoi già creare il tuo primo torneo dal tuo pannello di amministrazione.',
    publicationReceiptSubject: (name) =>
      `Ricevuta di pagamento — Pubblicazione di ${name}`,
    publicationReceiptBody1: (name) =>
      `Confermiamo la ricezione del tuo pagamento per la pubblicazione del torneo <strong>${name}</strong>.`,
    amountPaidLabel: 'Importo pagato:',
    publicationReceiptBody2:
      'Il tuo torneo è ora pubblicato e visibile pubblicamente.',
    subscriptionReceiptSubject:
      'Conferma del tuo abbonamento annuale TournArena',
    subscriptionReceiptBody1: (org) =>
      `Confermiamo la sottoscrizione di <strong>${org}</strong> all'abbonamento annuale TournArena.`,
    subscriptionReceiptBody2: (expiry) =>
      `Il tuo abbonamento è attivo fino al <strong>${expiry}</strong> e copre la pubblicazione di tutti i tuoi tornei in questo periodo.`,
    footerTagline: 'TournArena — il battito della competizione',
  },
  pt: {
    greeting: (firstName) => `Olá ${firstName},`,
    invitationSubject: (org) => `Convite para se juntar a ${org} no TournArena`,
    invitationIntro: (org) =>
      `Foi convidado·a a juntar-se a <strong>${org}</strong> no TournArena.`,
    invitationCta: 'Aceitar o convite',
    invitationExpiry: 'Este link expira em 7 dias.',
    verifySubject: 'Verifique o seu email — TournArena',
    verifyIntro:
      'Mais um passo antes de poder usar a sua conta de organizador·a: confirme que este endereço de email lhe pertence.',
    verifyCta: 'Verificar o meu email',
    verifyExpiry: 'Este link expira em 24 horas.',
    welcomeSubject: 'Bem-vindo ao TournArena',
    welcomeBody1: (org) =>
      `A sua conta de organizador·a foi criada, assim como a sua organização <strong>${org}</strong> no TournArena.`,
    welcomeBody2:
      'Já pode criar o seu primeiro torneio a partir do seu painel de administração.',
    publicationReceiptSubject: (name) =>
      `Recibo de pagamento — Publicação de ${name}`,
    publicationReceiptBody1: (name) =>
      `Confirmamos a receção do seu pagamento para a publicação do torneio <strong>${name}</strong>.`,
    amountPaidLabel: 'Valor pago:',
    publicationReceiptBody2:
      'O seu torneio está agora publicado e visível publicamente.',
    subscriptionReceiptSubject:
      'Confirmação da sua assinatura anual TournArena',
    subscriptionReceiptBody1: (org) =>
      `Confirmamos a assinatura de <strong>${org}</strong> ao plano anual TournArena.`,
    subscriptionReceiptBody2: (expiry) =>
      `A sua assinatura está ativa até <strong>${expiry}</strong> e cobre a publicação de todos os seus torneios durante este período.`,
    footerTagline: 'TournArena — o pulso da competição',
  },
};

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
    lang: MailLanguage = DEFAULT_MAIL_LANGUAGE,
  ): Promise<void> {
    const copy = MAIL_COPY[lang];
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: copy.invitationSubject(organizationName),
      html: this.wrapEmail(
        `
        <p>${copy.invitationIntro(organizationName)}</p>
        <p><a href="${inviteUrl}" class="ap-mail-cta">${copy.invitationCta}</a></p>
        <p>${copy.invitationExpiry}</p>
      `,
        lang,
      ),
    });
  }

  async sendEmailVerificationEmail(
    to: string,
    firstName: string,
    verifyUrl: string,
    lang: MailLanguage = DEFAULT_MAIL_LANGUAGE,
  ): Promise<void> {
    const copy = MAIL_COPY[lang];
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: copy.verifySubject,
      html: this.wrapEmail(
        `
        <p>${copy.greeting(firstName)}</p>
        <p>${copy.verifyIntro}</p>
        <p><a href="${verifyUrl}" class="ap-mail-cta">${copy.verifyCta}</a></p>
        <p>${copy.verifyExpiry}</p>
      `,
        lang,
      ),
    });
  }

  async sendAccountCreatedEmail(
    to: string,
    firstName: string,
    organizationName: string,
    lang: MailLanguage = DEFAULT_MAIL_LANGUAGE,
  ): Promise<void> {
    const copy = MAIL_COPY[lang];
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: copy.welcomeSubject,
      html: this.wrapEmail(
        `
        <p>${copy.greeting(firstName)}</p>
        <p>${copy.welcomeBody1(organizationName)}</p>
        <p>${copy.welcomeBody2}</p>
      `,
        lang,
      ),
    });
  }

  async sendPublicationReceiptEmail(
    to: string,
    tournamentName: string,
    amountCents: number,
    currency: string,
    lang: MailLanguage = DEFAULT_MAIL_LANGUAGE,
  ): Promise<void> {
    const copy = MAIL_COPY[lang];
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: copy.publicationReceiptSubject(tournamentName),
      html: this.wrapEmail(
        `
        <p>${copy.publicationReceiptBody1(tournamentName)}</p>
        <p>${copy.amountPaidLabel} <strong>${this.formatAmount(amountCents, currency, lang)}</strong></p>
        <p>${copy.publicationReceiptBody2}</p>
      `,
        lang,
      ),
    });
  }

  async sendSubscriptionReceiptEmail(
    to: string,
    organizationName: string,
    amountCents: number,
    currency: string,
    expiresAt: Date,
    lang: MailLanguage = DEFAULT_MAIL_LANGUAGE,
  ): Promise<void> {
    const copy = MAIL_COPY[lang];
    const formattedExpiry = new Intl.DateTimeFormat(lang, {
      dateStyle: 'long',
    }).format(expiresAt);
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: copy.subscriptionReceiptSubject,
      html: this.wrapEmail(
        `
        <p>${copy.subscriptionReceiptBody1(organizationName)}</p>
        <p>${copy.amountPaidLabel} <strong>${this.formatAmount(amountCents, currency, lang)}</strong></p>
        <p>${copy.subscriptionReceiptBody2(formattedExpiry)}</p>
      `,
        lang,
      ),
    });
  }

  // Not translated: this is a message a public visitor typed into the
  // contact form, delivered to TournArena's own team inbox (this.
  // contactRecipient) -- there's no organizer/visitor language preference to
  // honor here, only the internal team's working language.
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

  private formatAmount(
    amountCents: number,
    currency: string,
    lang: MailLanguage,
  ): string {
    return new Intl.NumberFormat(lang, {
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
  // `lang` defaults to French (sendContactMessage's fixed-French use, the
  // only caller that doesn't pass one) rather than DEFAULT_MAIL_LANGUAGE's
  // import, since this stays a plain string param independent of the mail
  // language type -- the <html lang> attribute accepts any BCP-47 tag.
  private wrapEmail(
    bodyHtml: string,
    lang: MailLanguage | 'fr' = 'fr',
  ): string {
    // Inlined directly on the <a> rather than via a <style> block + class --
    // some webmail sanitizers (confirmed: Hostinger/Titan) strip <style>
    // tags entirely, which would leave CTA buttons completely unstyled.
    const ctaStyle =
      'display:inline-block;background:#1e293b;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;';
    const footerTagline =
      MAIL_COPY[lang]?.footerTagline ?? MAIL_COPY.fr.footerTagline;
    return `
      <!doctype html>
      <html lang="${lang}">
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
                      ${footerTagline}
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
