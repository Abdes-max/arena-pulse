// Audit finding (securite-audit.md): every logo upload (team/tournament/
// sponsor) only ever checked the *declared* mimetype -- multer's own field
// for a direct upload, or a fetched response's Content-Type header for
// teams.service.ts's CSV-import path -- never the actual file bytes. A file
// renamed to `.png` with a spoofed Content-Type would sail straight through
// and get written to disk (and later served back out under /uploads) as
// whatever it actually is. Checking the real magic bytes closes that gap
// without pulling in a dependency for 3 well-known, trivially-recognizable
// signatures.
type MagicByteCheck = (buffer: Buffer) => boolean;

const IMAGE_MAGIC_BYTE_CHECKS: Record<string, MagicByteCheck> = {
  'image/png': (buffer) =>
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (buffer) =>
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff,
  // RIFF????WEBP -- the 4 bytes at offset 4 are the chunk size, irrelevant here.
  'image/webp': (buffer) =>
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP',
};

/**
 * True only if `buffer` actually starts with the magic bytes for the given
 * (already allowlisted) image mimetype. Unknown mimetypes always fail
 * closed -- callers are expected to have already rejected those via their
 * own extension/mimetype allowlist before reaching this check.
 */
export function matchesImageMagicBytes(
  buffer: Buffer,
  mimetype: string,
): boolean {
  return IMAGE_MAGIC_BYTE_CHECKS[mimetype]?.(buffer) ?? false;
}
