import { TicketsService } from './tickets.service';
import { buildQrPayload } from './ticketing.utils';

function makeReservation(overrides: any = {}) {
  return {
    id: 'res-1',
    code: 'URCO-AB23CD',
    status: 'CONFIRMED',
    passengerName: 'Awa Kone',
    passengerPhone: '0701020304',
    seats: 1,
    totalPrice: 6000,
    trip: {
      stationId: 'station-1',
      status: 'SCHEDULED',
      destinationCity: 'Bouaké',
      departureAt: new Date('2030-01-01T07:00:00Z'),
      vehicleType: 'Car',
      conditions: null,
      arrivalStation: null,
      station: { id: 'station-1', name: 'Adjamé', city: 'Abidjan', companyId: 'company-1', company: { name: 'UTB', logo: '/l.png' } },
    },
    ...overrides,
  };
}

describe('TicketsService.verify', () => {
  let prisma: any;
  let service: TicketsService;
  const audit = { log: jest.fn() };
  const station = { type: 'station' as const, id: 'station-1', companyId: 'company-1', stationId: 'station-1' };
  const inspector = { type: 'inspector' as const, id: 'insp-1', companyId: 'company-1' };

  beforeEach(() => {
    prisma = {
      ticketReservation: { findUnique: jest.fn(), updateMany: jest.fn() },
      ticketValidation: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    };
    service = new TicketsService(prisma, audit as any);
  });

  it('rejects an invalid code without hitting the database', async () => {
    const res = await service.verify(station, 'nope');
    expect(res).toMatchObject({ valid: false, result: 'INVALID_CODE' });
    expect(prisma.ticketReservation.findUnique).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND for an unknown code', async () => {
    prisma.ticketReservation.findUnique.mockResolvedValue(null);
    const res = await service.verify(station, 'URCO-AB23CD');
    expect(res.result).toBe('NOT_FOUND');
  });

  it('validates a confirmed ticket from its QR payload', async () => {
    prisma.ticketReservation.findUnique.mockResolvedValue(makeReservation());
    const res = await service.verify(inspector, buildQrPayload('URCO-AB23CD'));
    expect(res).toMatchObject({ valid: true, result: 'VALID' });
    expect(prisma.ticketValidation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ inspectorId: 'insp-1', result: 'VALID', boarded: false }),
    });
  });

  it('never lets an inspector board a ticket (read-only)', async () => {
    prisma.ticketReservation.findUnique.mockResolvedValue(makeReservation());
    await service.verify(inspector, 'URCO-AB23CD', true);
    expect(prisma.ticketReservation.updateMany).not.toHaveBeenCalled();
  });

  it('boards a ticket atomically for the departure station agent', async () => {
    prisma.ticketReservation.findUnique.mockResolvedValue(makeReservation());
    prisma.ticketReservation.updateMany.mockResolvedValue({ count: 1 });
    const res = await service.verify(station, 'URCO-AB23CD', true);
    expect(res.result).toBe('BOARDED');
    expect(prisma.ticketReservation.updateMany).toHaveBeenCalledWith({
      where: { id: 'res-1', status: 'CONFIRMED' },
      data: { status: 'USED' },
    });
  });

  it('reports ALREADY_USED when a concurrent scan boarded first', async () => {
    prisma.ticketReservation.findUnique.mockResolvedValue(makeReservation());
    prisma.ticketReservation.updateMany.mockResolvedValue({ count: 0 });
    const res = await service.verify(station, 'URCO-AB23CD', true);
    expect(res).toMatchObject({ valid: false, result: 'ALREADY_USED' });
  });

  it('refuses boarding at another station of the same company', async () => {
    prisma.ticketReservation.findUnique.mockResolvedValue(makeReservation());
    const res = await service.verify({ ...station, id: 'station-2', stationId: 'station-2' }, 'URCO-AB23CD', true);
    expect(res.result).toBe('WRONG_STATION');
    expect(prisma.ticketReservation.updateMany).not.toHaveBeenCalled();
  });

  it('hides ticket details from another company', async () => {
    prisma.ticketReservation.findUnique.mockResolvedValue(makeReservation());
    const res: any = await service.verify({ ...inspector, companyId: 'company-2' }, 'URCO-AB23CD');
    expect(res.result).toBe('WRONG_COMPANY');
    expect(res.ticket).toBeUndefined();
  });

  it.each([
    ['USED', 'SCHEDULED', 'ALREADY_USED'],
    ['PENDING_PAYMENT', 'SCHEDULED', 'NOT_PAID'],
    ['CANCELLED', 'SCHEDULED', 'CANCELLED'],
    ['EXPIRED', 'SCHEDULED', 'EXPIRED'],
    ['CONFIRMED', 'CANCELLED', 'TRIP_CANCELLED'],
  ])('reservation %s on trip %s gives %s', async (status, tripStatus, expected) => {
    const reservation = makeReservation({ status });
    reservation.trip.status = tripStatus;
    prisma.ticketReservation.findUnique.mockResolvedValue(reservation);
    const res = await service.verify(inspector, 'URCO-AB23CD');
    expect(res).toMatchObject({ valid: false, result: expected });
  });
});
