import {
  buildQrPayload,
  generateInspectorLoginId,
  generatePassword,
  generateReservationCode,
  generateStationLoginId,
  normalizeCity,
  parseTicketInput,
  RESERVATION_CODE_REGEX,
} from './ticketing.utils';

describe('ticketing utils', () => {
  it('generates URCO-XXXXXX codes', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateReservationCode()).toMatch(RESERVATION_CODE_REGEX);
    }
  });

  it('generates login ids and passwords', () => {
    expect(generateStationLoginId()).toMatch(/^GARE-[A-Z0-9]{6}$/);
    expect(generateInspectorLoginId()).toMatch(/^CTRL-[A-Z0-9]{6}$/);
    expect(generatePassword()).toHaveLength(10);
  });

  it('accepts a typed code, case-insensitively', () => {
    expect(parseTicketInput(' urco-ab23cd ')).toBe('URCO-AB23CD');
  });

  it('accepts a signed QR payload', () => {
    const code = generateReservationCode();
    expect(parseTicketInput(buildQrPayload(code))).toBe(code);
  });

  it('rejects a forged QR payload', () => {
    const code = generateReservationCode();
    const other = generateReservationCode();
    const forged = `${other}.${buildQrPayload(code).split('.')[1]}`;
    expect(parseTicketInput(forged)).toBeNull();
    expect(parseTicketInput(`${code}.deadbeef`)).toBeNull();
  });

  it('rejects malformed codes', () => {
    expect(parseTicketInput('URCO-12')).toBeNull();
    expect(parseTicketInput('')).toBeNull();
    expect(parseTicketInput('HELLO-ABCDEF')).toBeNull();
  });

  it('normalizes city names', () => {
    expect(normalizeCity('  bouaké  ')).toBe('Bouaké');
    expect(normalizeCity('grand   bassam')).toBe('Grand bassam');
  });
});
