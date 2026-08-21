import { MailService } from '../mail/mail.service';
import { KeltoContactService } from './kelto-contact.service';

function buildService() {
  const mailService = {
    sendKeltoContactMessage: jest.fn().mockResolvedValue(undefined),
  };
  const service = new KeltoContactService(
    mailService as unknown as MailService,
  );
  return { service, mailService };
}

describe('KeltoContactService', () => {
  it('sends the mail and redirects to merci.html on a valid submission', async () => {
    const { service, mailService } = buildService();

    const url = await service.handleSubmission({
      nom: 'Ada Lovelace',
      email: 'ada@example.com',
      typeDemande: 'projet_devis',
      message: 'Bonjour, je voudrais un devis.',
      site_web: '',
    });

    expect(mailService.sendKeltoContactMessage).toHaveBeenCalledWith({
      nom: 'Ada Lovelace',
      email: 'ada@example.com',
      typeDemandeLabel: 'Projet / devis',
      message: 'Bonjour, je voudrais un devis.',
    });
    expect(url).toBe('https://kelto-studio.fr/merci.html');
  });

  it.each(['probleme', 'autre'])(
    'accepts the %s request type',
    async (typeDemande) => {
      const { service, mailService } = buildService();

      await service.handleSubmission({
        nom: 'Ada',
        email: 'ada@example.com',
        typeDemande,
        message: 'Bonjour',
      });

      expect(mailService.sendKeltoContactMessage).toHaveBeenCalled();
    },
  );

  it('silently discards the submission when the honeypot is filled, without sending mail', async () => {
    const { service, mailService } = buildService();

    const url = await service.handleSubmission({
      nom: 'Bot',
      email: 'bot@example.com',
      typeDemande: 'autre',
      message: 'spam',
      site_web: 'https://spam.example.com',
    });

    expect(mailService.sendKeltoContactMessage).not.toHaveBeenCalled();
    // Same success URL as a genuine submission -- see the service's comment
    // on why the bot gets no signal that it was caught.
    expect(url).toBe('https://kelto-studio.fr/merci.html');
  });

  it.each([
    [
      'missing nom',
      { nom: '', email: 'ada@example.com', typeDemande: 'autre', message: 'x' },
    ],
    [
      'invalid email',
      { nom: 'Ada', email: 'not-an-email', typeDemande: 'autre', message: 'x' },
    ],
    [
      'unknown typeDemande',
      {
        nom: 'Ada',
        email: 'ada@example.com',
        typeDemande: 'hack',
        message: 'x',
      },
    ],
    [
      'missing message',
      {
        nom: 'Ada',
        email: 'ada@example.com',
        typeDemande: 'autre',
        message: '',
      },
    ],
  ])('redirects to the error anchor on %s', async (_label, body) => {
    const { service, mailService } = buildService();

    const url = await service.handleSubmission(body);

    expect(mailService.sendKeltoContactMessage).not.toHaveBeenCalled();
    expect(url).toBe('https://kelto-studio.fr/#contact-erreur');
  });

  it('rejects a non-string body field instead of throwing', async () => {
    const { service, mailService } = buildService();

    const url = await service.handleSubmission({
      nom: { toString: () => 'Ada' },
      email: 'ada@example.com',
      typeDemande: 'autre',
      message: 'x',
    });

    expect(mailService.sendKeltoContactMessage).not.toHaveBeenCalled();
    expect(url).toBe('https://kelto-studio.fr/#contact-erreur');
  });
});
