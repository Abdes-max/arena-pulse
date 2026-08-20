import { matchesImageMagicBytes } from './image-magic-bytes.util';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const WEBP_BYTES = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.from([0, 0, 0, 0]), // chunk size, irrelevant to the check
  Buffer.from('WEBP', 'latin1'),
]);

describe('matchesImageMagicBytes', () => {
  it('accepts a buffer starting with the PNG signature for image/png', () => {
    expect(matchesImageMagicBytes(PNG_BYTES, 'image/png')).toBe(true);
  });

  it('accepts a buffer starting with the JPEG signature for image/jpeg', () => {
    expect(matchesImageMagicBytes(JPEG_BYTES, 'image/jpeg')).toBe(true);
  });

  it('accepts a RIFF/WEBP buffer for image/webp', () => {
    expect(matchesImageMagicBytes(WEBP_BYTES, 'image/webp')).toBe(true);
  });

  it('rejects a PNG-declared buffer whose bytes are plain text', () => {
    expect(matchesImageMagicBytes(Buffer.from('not-a-png'), 'image/png')).toBe(
      false,
    );
  });

  it('rejects cross-signature mismatches (JPEG bytes declared as PNG)', () => {
    expect(matchesImageMagicBytes(JPEG_BYTES, 'image/png')).toBe(false);
  });

  it('rejects a buffer shorter than the signature it claims to have', () => {
    expect(matchesImageMagicBytes(Buffer.from([0x89, 0x50]), 'image/png')).toBe(
      false,
    );
  });

  it('fails closed on an unrecognized mimetype', () => {
    expect(matchesImageMagicBytes(PNG_BYTES, 'image/svg+xml')).toBe(false);
  });
});
