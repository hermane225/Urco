import { BadRequestException } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { RESERVATION_CODE_REGEX } from './ticketing.utils';

function fullReservation(overrides: any = {}) {
  return {
    id: 'res-1',
    userId: 'user-1',
    code: 'URCO-AB23CD',
    status: 'CONFIRMED',
    seats: 2,
    totalPrice: 12000,
    passengerName: 'Awa Kone',
    passengerPhone: '0701020304',
    passengerEmail: null,
    expiresAt: null,
    payment: null,
    trip: {
      id: 'trip-1',
      stationId: 'station-1',
      destinationCity: 'Bouaké',
      departureAt: new Date('2030-01-01T07:00:00Z'),
      vehicleType: 'Car',
      conditions: null,
      price: 6000,
      arrivalStation: null,
      station: {
        id: 'station-1',
        name: 'Adjamé',
        city: 'Abidjan',
        address: 'x',
        companyId: 'company-1',
        company: { id: 'company-1', name: 'UTB', logo: '/l.png', phone: null, whatsapp: null },
      },
    },
    ...overrides,
  };
}

describe('ReservationsService', () => {
  let prisma: any;
  let service: ReservationsService;
  const audit = { log: jest.fn() };
  const notifications = { sendSms: jest.fn().mockResolvedValue(true), sendEmail: jest.fn().mockResolvedValue(true) };
  const provider = { name: 'sandbox', initiate: jest.fn(), verify: jest.fn(), extractReference: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      ticketPayment: { updateMany: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn(), findUnique: jest.fn() },
      ticketReservation: { update: jest.fn(), findUniqueOrThrow: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
      trip: { updateMany: jest.fn(), update: jest.fn() },
    };
    prisma.$transaction = jest.fn((fn: any) => fn(prisma));
    service = new ReservationsService(prisma, audit as any, notifications as any, provider as any);
  });

  describe('confirmPayment', () => {
    it('is idempotent: a duplicate webhook confirms nothing', async () => {
      prisma.ticketPayment.updateMany.mockResolvedValue({ count: 0 });
      await service.confirmPayment('pay-1', 'SYSTEM');
      expect(prisma.ticketReservation.update).not.toHaveBeenCalled();
      expect(notifications.sendSms).not.toHaveBeenCalled();
    });

    it('confirms a pending reservation with a URCO code and sends the ticket', async () => {
      prisma.ticketPayment.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticketPayment.findUniqueOrThrow.mockResolvedValue({
        id: 'pay-1',
        reservation: { id: 'res-1', status: 'PENDING_PAYMENT', seats: 2, trip: { id: 'trip-1' } },
      });
      prisma.ticketReservation.findUniqueOrThrow.mockResolvedValue(fullReservation());

      await service.confirmPayment('pay-1', 'SYSTEM');

      const update = prisma.ticketReservation.update.mock.calls[0][0];
      expect(update.data.status).toBe('CONFIRMED');
      expect(update.data.code).toMatch(RESERVATION_CODE_REGEX);
      expect(notifications.sendSms).toHaveBeenCalledWith('0701020304', expect.stringContaining('URCO-AB23CD'));
    });

    it('re-books seats when payment arrives after expiry', async () => {
      prisma.ticketPayment.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticketPayment.findUniqueOrThrow.mockResolvedValue({
        id: 'pay-1',
        reservation: {
          id: 'res-1',
          status: 'EXPIRED',
          seats: 2,
          trip: { id: 'trip-1', status: 'SCHEDULED', departureAt: new Date(Date.now() + 3600000) },
        },
      });
      prisma.trip.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticketReservation.findUniqueOrThrow.mockResolvedValue(fullReservation());

      await service.confirmPayment('pay-1', 'SYSTEM');

      expect(prisma.trip.updateMany).toHaveBeenCalledWith({
        where: { id: 'trip-1', availableSeats: { gte: 2 } },
        data: { availableSeats: { decrement: 2 } },
      });
      expect(prisma.ticketReservation.update.mock.calls[0][0].data.status).toBe('CONFIRMED');
    });

    it('flags a refund when seats are gone after expiry', async () => {
      prisma.ticketPayment.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticketPayment.findUniqueOrThrow.mockResolvedValue({
        id: 'pay-1',
        reservation: {
          id: 'res-1',
          status: 'EXPIRED',
          seats: 2,
          trip: { id: 'trip-1', status: 'SCHEDULED', departureAt: new Date(Date.now() + 3600000) },
        },
      });
      prisma.trip.updateMany.mockResolvedValue({ count: 0 });
      prisma.ticketReservation.findUniqueOrThrow.mockResolvedValue(
        fullReservation({ status: 'EXPIRED', code: null }),
      );

      await service.confirmPayment('pay-1', 'SYSTEM');

      expect(prisma.ticketPayment.update).toHaveBeenCalledWith({ where: { id: 'pay-1' }, data: { status: 'REFUND_PENDING' } });
      expect(prisma.ticketReservation.update).not.toHaveBeenCalled();
      expect(notifications.sendSms).toHaveBeenCalledWith('0701020304', expect.stringContaining('remboursé'));
    });
  });

  describe('present', () => {
    it('hides the code and QR until the reservation is paid', () => {
      const res = service.present(fullReservation({ status: 'PENDING_PAYMENT' }) as any);
      expect(res.code).toBeNull();
      expect(res.ticket).toBeNull();
    });

    it('exposes the digital ticket once confirmed', () => {
      const res = service.present(fullReservation() as any);
      expect(res.ticket).toMatchObject({ code: 'URCO-AB23CD', destinationCity: 'Bouaké', seats: 2 });
      expect(res.ticket!.qrPayload.startsWith('URCO-AB23CD.')).toBe(true);
    });
  });

  describe('counterSale', () => {
    it('refuses to sell a trip departing from another station', async () => {
      prisma.trip.findFirst = jest.fn().mockResolvedValue({ id: 'trip-1', stationId: 'station-9', price: 6000, station: { companyId: 'company-1' } });
      await expect(
        service.counterSale('station-1', 'company-1', { tripId: 'trip-1', seats: 1, passengerName: 'A', passengerPhone: '07' }),
      ).rejects.toThrow('Ce trajet ne part pas de votre gare');
    });

    it('prevents overselling', async () => {
      prisma.trip.findFirst = jest.fn().mockResolvedValue({ id: 'trip-1', stationId: 'station-1', price: 6000, station: { companyId: 'company-1' } });
      prisma.trip.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.counterSale('station-1', 'company-1', { tripId: 'trip-1', seats: 3, passengerName: 'A', passengerPhone: '07' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
