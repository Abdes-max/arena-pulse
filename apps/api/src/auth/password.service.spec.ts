import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes a password and verifies it round-trips', async () => {
    const hash = await service.hash('correct-horse-battery-staple');
    expect(hash).not.toBe('correct-horse-battery-staple');
    await expect(
      service.verify(hash, 'correct-horse-battery-staple'),
    ).resolves.toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await service.hash('correct-horse-battery-staple');
    await expect(service.verify(hash, 'wrong-password')).resolves.toBe(false);
  });
});
