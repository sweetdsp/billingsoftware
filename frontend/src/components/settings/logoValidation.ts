import { getErrorCode, getErrorMessage } from '../../services/api';
import { LOGO_CONTENT_TYPES, LOGO_EXTENSIONS, LOGO_MAX_BYTES } from '../../services/uploadService';

export const LOGO_ACCEPT = [...LOGO_CONTENT_TYPES, ...LOGO_EXTENSIONS].join(',');
export const LOGO_MAX_MB = LOGO_MAX_BYTES / (1024 * 1024);

const UNSUPPORTED_MESSAGE = 'Logos must be a PNG, JPEG or SVG image.';
const TOO_LARGE_MESSAGE = `That file is too large. Logos can be at most ${LOGO_MAX_MB} MB.`;

/** Client-side pre-check mirroring the backend logo rules. Returns an error message or null. */
export function validateLogoFile(file: File): string | null {
  const name = file.name.toLowerCase();
  const typeOk = (LOGO_CONTENT_TYPES as readonly string[]).includes(file.type);
  const extOk = LOGO_EXTENSIONS.some((ext) => name.endsWith(ext));
  // Some browsers leave `type` empty for SVGs; fall back to the extension then.
  if (!(typeOk || (file.type === '' && extOk))) return UNSUPPORTED_MESSAGE;
  if (file.size === 0) return 'That file is empty.';
  if (file.size > LOGO_MAX_BYTES) return TOO_LARGE_MESSAGE;
  return null;
}

/** Friendly message for `POST /uploads` 400 error codes. */
export function uploadErrorMessage(err: unknown): string {
  switch (getErrorCode(err)) {
    case 'unsupported_file_type':
      return UNSUPPORTED_MESSAGE;
    case 'file_too_large':
      return TOO_LARGE_MESSAGE;
    case 'unsafe_svg':
      return 'This SVG contains scripts or external references and cannot be used. Export a plain SVG or use a PNG.';
    default:
      return getErrorMessage(err, 'Could not upload the logo. Please try again.');
  }
}
