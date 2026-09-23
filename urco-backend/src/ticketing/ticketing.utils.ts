import { createHmac, randomInt, timingSafeEqual } from 'crypto';

// Sans caractères ambigus (0/O, 1/I/L) pour faciliter la saisie au guichet.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export const RESERVATION_CODE_REGEX = /^URCO-[A-Z0-9]{6}$/;

function randomString(length: number, alphabet: string): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[randomInt(alphabet.length)];
  }
  return out;
}

export function generateReservationCode(): string {
  return `URCO-${randomString(6, CODE_ALPHABET)}`;
}

export function generateStationLoginId(): string {
  return `GARE-${randomString(6, CODE_ALPHABET)}`;
}

export function generateInspectorLoginId(): string {
  return `CTRL-${randomString(6, CODE_ALPHABET)}`;
}

export function generatePassword(length = 10): string {
  return randomString(length, PASSWORD_ALPHABET);
}

function qrSecret(): string {
  return process.env.TICKETING_QR_SECRET || process.env.JWT_SECRET || 'your-super-secret-jwt-key';
}

function sign(code: string): string {
  return createHmac('sha256', qrSecret()).update(code).digest('hex').slice(0, 16);
}

/** Contenu du QR code : le code URCO signé, pour détecter les QR contrefaits. */
export function buildQrPayload(code: string): string {
  return `${code}.${sign(code)}`;
}

/**
 * Accepte un code saisi (URCO-XXXXXX) ou le contenu scanné d'un QR code.
 * Retourne le code normalisé, ou null si le format ou la signature est invalide.
 */
export function parseTicketInput(input: string): string | null {
  const raw = (input || '').trim().toUpperCase();
  const [code, signature] = raw.split('.');
  if (!RESERVATION_CODE_REGEX.test(code)) {
    return null;
  }
  if (signature === undefined) {
    return code;
  }
  const expected = Buffer.from(sign(code).toUpperCase());
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null;
  }
  return code;
}

export function normalizeCity(city: string): string {
  const trimmed = (city || '').trim().replace(/\s+/g, ' ');
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function envInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
