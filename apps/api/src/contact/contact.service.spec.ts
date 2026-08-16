import { MailService } from '../mail/mail.service';
import { ContactService } from './contact.service';

describe('ContactService', () => {
  it('forwards the message to MailService.sendContactMessage', async () => {
    const mailService = {
      sendContactMessage: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ContactService(mailService as unknown as MailService);
    const dto = {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      subject: 'Question sur les tarifs',
      message: 'Bonjour, ...',
    };

    await service.send(dto);

    expect(mailService.sendContactMessage).toHaveBeenCalledWith(dto);
  });

  it('propagates a send failure instead of swallowing it', async () => {
    const mailService = {
      sendContactMessage: jest.fn().mockRejectedValue(new Error('SMTP down')),
    };
    const service = new ContactService(mailService as unknown as MailService);

    await expect(
      service.send({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        subject: 'Question',
        message: 'Bonjour',
      }),
    ).rejects.toThrow('SMTP down');
  });
});
