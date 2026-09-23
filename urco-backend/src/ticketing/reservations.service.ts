import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TicketingAuditService } from './ticketing-audit.service';
import { TicketingNotificationsService } from './ticketing-notifications.service';
import { CounterSaleDto, CreateReservationDto, ListQuery, PayReservationDto } from './dto/ticketing.dto';
import { TICKET_PAYMENT_PROVIDER, TicketPaymentProvider } from './payment-providers/payment-provider.interface';
import { buildQrPayload, envInt, generateReservationCode } from './ticketing.utils';
import { formatDeparture } from './trips.service';
import { escapeHtml } from './companies.service';

const MAX_PENDING_RESERVATIONS_PER_USER = 3;

const RESERVATION_INCLUDE = {
  trip: {
    include: {
      station: {
        select: {
          id: true,
          name: true,
          city: true,
          address: true,
          companyId: true,
          company: { select: { id: true, name: true, logo: true, phone: true, whatsapp: true } },
        },
      },
      arrivalStation: { select: { id: true, name: true, city: true, address: true } },
    },
  },
  payment: {
    select: { id: true, amount: true, currency: true, method: true, status: true, paidAt: true, provider: true },
  },
} satisfies Prisma.TicketReservationInclude;

type ReservationWithTrip = Prisma.TicketReservationGetPayload<{ include: typeof RESERVATION_INCLUDE }>;

function rangeFilter(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  const filter: Prisma.DateTimeFilter = {};
  if (from) filter.gte = new Date(`${from}T00:00:00.000Z`);
  if (to) filter.lt = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86400000);
  return filter;
}

@Injectable()
export class ReservationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReservationsService.name);
  private timer?: NodeJS.Timeout;
  private jobRunning = false;

  constructor(
    private prisma: PrismaService,
    private audit: TicketingAuditService,
    private notifications: TicketingNotificationsService,
    @Inject(TICKET_PAYMENT_PROVIDER) private paymentProvider: TicketPaymentProvider,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.TICKETING_JOBS_DISABLED === 'true') return;
    this.timer = setInterval(() => void this.runPeriodicJobs(), 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ------------------------------------------------------------ Utilisateur

  async createForUser(userId: string, dto: CreateReservationDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, phone: true, email: true },
    });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    const passengerPhone = dto.passengerPhone || user.phone;
    if (!passengerPhone) {
      throw new BadRequestException('Un numéro de téléphone est requis pour recevoir le billet');
    }

    // Anti-accaparement : limite les réservations non payées simultanées
    const pending = await this.prisma.ticketReservation.count({
      where: { userId, status: 'PENDING_PAYMENT', expiresAt: { gt: new Date() } },
    });
    if (pending >= MAX_PENDING_RESERVATIONS_PER_USER) {
      throw new BadRequestException('Trop de réservations en attente de paiement. Payez ou annulez-en une.');
    }

    const trip = await this.getBookableTrip(dto.tripId);
    const holdMinutes = envInt('TICKETING_PAYMENT_HOLD_MINUTES', 15);

    const reservation = await this.prisma.$transaction(async (tx) => {
      await this.holdSeats(tx, trip.id, dto.seats);
      return tx.ticketReservation.create({
        data: {
          tripId: trip.id,
          userId,
          seats: dto.seats,
          totalPrice: trip.price * dto.seats,
          passengerName: dto.passengerName || `${user.firstName} ${user.lastName}`.trim(),
          passengerPhone,
          passengerEmail: dto.passengerEmail || user.email,
          expiresAt: new Date(Date.now() + holdMinutes * 60 * 1000),
        },
        include: RESERVATION_INCLUDE,
      });
    });

    await this.audit.log({
      actorType: 'USER',
      actorId: userId,
      companyId: trip.station.companyId,
      action: 'RESERVATION_CREATED',
      entity: 'TicketReservation',
      entityId: reservation.id,
      data: { tripId: trip.id, seats: dto.seats },
    });
    return this.present(reservation);
  }

  async listMine(userId: string) {
    const reservations = await this.prisma.ticketReservation.findMany({
      where: { userId },
      include: RESERVATION_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return reservations.map((r) => this.present(r));
  }

  async getMine(userId: string, reservationId: string) {
    return this.present(await this.getOwned(userId, reservationId));
  }

  async pay(userId: string, reservationId: string, dto: PayReservationDto) {
    const reservation = await this.getOwned(userId, reservationId);

    if (reservation.status !== 'PENDING_PAYMENT') {
      throw new BadRequestException('Cette réservation n\'est pas en attente de paiement');
    }
    if (reservation.expiresAt && reservation.expiresAt < new Date()) {
      throw new BadRequestException('Le délai de paiement est dépassé, refaites une réservation');
    }
    if (reservation.payment?.status === 'PENDING') {
      throw new BadRequestException('Un paiement est déjà en cours pour cette réservation');
    }
    if (reservation.payment?.status === 'PAID') {
      throw new BadRequestException('Cette réservation est déjà payée');
    }

    const paymentData = {
      stationId: reservation.trip.stationId,
      amount: reservation.totalPrice,
      method: dto.method,
      provider: this.paymentProvider.name,
      payerPhone: dto.payerPhone,
      status: 'PENDING' as const,
      providerReference: null,
      rawResponse: Prisma.DbNull,
    };
    const payment = await this.prisma.ticketPayment.upsert({
      where: { reservationId },
      create: { reservationId, ...paymentData },
      update: paymentData, // nouvelle tentative après un échec
    });

    const result = await this.paymentProvider.initiate({
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      method: dto.method,
      payerPhone: dto.payerPhone,
      description: `Billet ${reservation.trip.station.company.name} ${reservation.trip.station.city} -> ${reservation.trip.destinationCity}`,
    });

    await this.prisma.ticketPayment.update({
      where: { id: payment.id },
      data: { providerReference: result.providerReference, rawResponse: result.raw ?? undefined },
    });

    await this.audit.log({
      actorType: 'USER',
      actorId: userId,
      companyId: reservation.trip.station.companyId,
      action: 'PAYMENT_INITIATED',
      entity: 'TicketPayment',
      entityId: payment.id,
      data: { method: dto.method, provider: this.paymentProvider.name, status: result.status },
    });

    if (result.status === 'PAID') {
      await this.confirmPayment(payment.id, 'SYSTEM');
    } else if (result.status === 'FAILED') {
      await this.failPayment(payment.id);
    }

    return {
      reservation: await this.getMine(userId, reservationId),
      paymentUrl: result.paymentUrl,
      instructions: result.instructions,
    };
  }

  /** Vérification automatique : interroge le fournisseur si le paiement est en attente. */
  async refreshPaymentStatus(userId: string, reservationId: string) {
    const reservation = await this.getOwned(userId, reservationId);
    if (reservation.payment?.status === 'PENDING') {
      await this.syncWithProvider(reservation.payment.id);
    }
    return this.getMine(userId, reservationId);
  }

  async cancelMine(userId: string, reservationId: string) {
    const reservation = await this.getOwned(userId, reservationId);
    if (reservation.status !== 'PENDING_PAYMENT') {
      throw new BadRequestException(
        'Seule une réservation non payée peut être annulée ici. Pour un billet payé, contactez la compagnie selon les conditions du trajet.',
      );
    }
    const released = await this.releaseReservation(reservationId, 'CANCELLED');
    if (released) {
      await this.audit.log({
        actorType: 'USER',
        actorId: userId,
        companyId: reservation.trip.station.companyId,
        action: 'RESERVATION_CANCELLED',
        entity: 'TicketReservation',
        entityId: reservationId,
      });
    }
    return this.getMine(userId, reservationId);
  }

  // ------------------------------------------------------------ Guichet

  async counterSale(stationId: string, companyId: string, dto: CounterSaleDto) {
    const trip = await this.getBookableTrip(dto.tripId);
    if (trip.stationId !== stationId) {
      throw new ForbiddenException('Ce trajet ne part pas de votre gare');
    }

    const reservation = await this.withUniqueCode(async (code) =>
      this.prisma.$transaction(async (tx) => {
        await this.holdSeats(tx, trip.id, dto.seats);
        const now = new Date();
        return tx.ticketReservation.create({
          data: {
            tripId: trip.id,
            seats: dto.seats,
            totalPrice: trip.price * dto.seats,
            passengerName: dto.passengerName,
            passengerPhone: dto.passengerPhone,
            passengerEmail: dto.passengerEmail,
            status: 'CONFIRMED',
            code,
            confirmedAt: now,
            payment: {
              create: {
                stationId,
                amount: trip.price * dto.seats,
                method: 'CASH',
                provider: 'counter',
                status: 'PAID',
                paidAt: now,
              },
            },
          },
          include: RESERVATION_INCLUDE,
        });
      }),
    );

    await this.audit.log({
      actorType: 'STATION_AGENT',
      actorId: stationId,
      companyId,
      action: 'COUNTER_SALE',
      entity: 'TicketReservation',
      entityId: reservation.id,
      data: { tripId: trip.id, seats: dto.seats, amount: reservation.totalPrice },
    });
    await this.sendTicket(reservation);
    return this.present(reservation);
  }

  // ------------------------------------------------------------ Compagnie / gare

  async listForCompany(companyId: string, query: ListQuery, forceStationId?: string) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const stationId = forceStationId ?? query.stationId;
    const where: Prisma.TicketReservationWhereInput = {
      trip: { station: { companyId }, ...(stationId ? { stationId } : {}) },
      ...(query.status ? { status: query.status as any } : {}),
      ...(rangeFilter(query.from, query.to) ? { createdAt: rangeFilter(query.from, query.to) } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.ticketReservation.findMany({
        where,
        include: RESERVATION_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ticketReservation.count({ where }),
    ]);
    return {
      data: data.map((r) => this.present(r)),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async listTransactions(companyId: string, query: ListQuery, forceStationId?: string) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const stationId = forceStationId ?? query.stationId;
    const where: Prisma.TicketPaymentWhereInput = {
      station: { companyId },
      ...(stationId ? { stationId } : {}),
      ...(query.status ? { status: query.status as any } : {}),
      ...(rangeFilter(query.from, query.to) ? { createdAt: rangeFilter(query.from, query.to) } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.ticketPayment.findMany({
        where,
        select: {
          id: true,
          amount: true,
          currency: true,
          method: true,
          provider: true,
          providerReference: true,
          status: true,
          paidAt: true,
          createdAt: true,
          station: { select: { id: true, name: true, city: true } },
          reservation: { select: { id: true, code: true, passengerName: true, seats: true, tripId: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ticketPayment.count({ where }),
    ]);
    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // ------------------------------------------------------------ Paiement

  /** Webhook : la référence reçue est toujours revérifiée auprès du fournisseur. */
  async handleWebhook(providerName: string, body: any, headers: Record<string, any>) {
    if (providerName !== this.paymentProvider.name) {
      throw new NotFoundException('Fournisseur inconnu');
    }
    const reference = this.paymentProvider.extractReference(body, headers);
    if (!reference) {
      throw new BadRequestException('Référence de paiement manquante');
    }
    const payment = await this.prisma.ticketPayment.findUnique({ where: { providerReference: reference } });
    if (!payment) {
      throw new NotFoundException('Paiement introuvable');
    }
    await this.syncWithProvider(payment.id);
    return { received: true };
  }

  async syncWithProvider(paymentId: string) {
    const payment = await this.prisma.ticketPayment.findUnique({ where: { id: paymentId } });
    if (!payment?.providerReference || payment.provider !== this.paymentProvider.name) return;
    if (payment.status !== 'PENDING' && payment.status !== 'FAILED') return;

    const result = await this.paymentProvider.verify(payment.providerReference);
    if (result.status === 'PAID') {
      await this.confirmPayment(payment.id, 'SYSTEM', result.raw);
    } else if (result.status === 'FAILED' && payment.status === 'PENDING') {
      await this.failPayment(payment.id, result.raw);
    }
  }

  async findPaymentIdByReference(reference: string) {
    const payment = await this.prisma.ticketPayment.findUnique({ where: { providerReference: reference } });
    if (!payment) {
      throw new NotFoundException('Paiement introuvable');
    }
    return payment.id;
  }

  /**
   * Passe le paiement à PAID et confirme la réservation avec un code URCO.
   * Idempotent : un webhook reçu plusieurs fois ne confirme qu'une fois.
   * Si la réservation a expiré entre-temps, on tente de reprendre les places ;
   * à défaut, le paiement passe en remboursement à traiter.
   */
  async confirmPayment(paymentId: string, actorType: 'SYSTEM' | 'PLATFORM_ADMIN', raw?: any) {
    const outcome = await this.withUniqueCode((code) =>
      this.prisma.$transaction(async (tx) => {
        const claimed = await tx.ticketPayment.updateMany({
          where: { id: paymentId, status: { in: ['PENDING', 'FAILED'] } },
          data: { status: 'PAID', paidAt: new Date(), ...(raw ? { rawResponse: raw } : {}) },
        });
        if (claimed.count === 0) {
          return { changed: false as const };
        }

        const payment = await tx.ticketPayment.findUniqueOrThrow({
          where: { id: paymentId },
          include: { reservation: { include: { trip: true } } },
        });
        const reservation = payment.reservation;

        if (reservation.status !== 'PENDING_PAYMENT') {
          // Réservation expirée ou annulée : reprendre les places si possible
          const trip = reservation.trip;
          const canRebook =
            (reservation.status === 'EXPIRED' || reservation.status === 'CANCELLED') &&
            trip.status === 'SCHEDULED' &&
            trip.departureAt > new Date() &&
            (await tx.trip.updateMany({
              where: { id: trip.id, availableSeats: { gte: reservation.seats } },
              data: { availableSeats: { decrement: reservation.seats } },
            })).count === 1;

          if (!canRebook) {
            await tx.ticketPayment.update({ where: { id: paymentId }, data: { status: 'REFUND_PENDING' } });
            return { changed: true as const, confirmed: false as const, reservationId: reservation.id };
          }
        }

        await tx.ticketReservation.update({
          where: { id: reservation.id },
          data: { status: 'CONFIRMED', code, confirmedAt: new Date(), expiresAt: null, cancelledAt: null },
        });
        return { changed: true as const, confirmed: true as const, reservationId: reservation.id };
      }),
    );

    if (!outcome.changed) return;

    const reservation = await this.prisma.ticketReservation.findUniqueOrThrow({
      where: { id: outcome.reservationId },
      include: RESERVATION_INCLUDE,
    });

    await this.audit.log({
      actorType,
      companyId: reservation.trip.station.companyId,
      action: outcome.confirmed ? 'PAYMENT_CONFIRMED' : 'PAYMENT_REFUND_PENDING',
      entity: 'TicketPayment',
      entityId: paymentId,
      data: { reservationId: reservation.id, code: reservation.code },
    });

    if (outcome.confirmed) {
      await this.sendTicket(reservation);
    } else {
      await this.notifications.sendSms(
        reservation.passengerPhone,
        `URCO: votre paiement de ${reservation.totalPrice} FCFA a été reçu mais les places ne sont plus disponibles. Vous serez remboursé.`,
      );
    }
  }

  private async failPayment(paymentId: string, raw?: any) {
    await this.prisma.ticketPayment.updateMany({
      where: { id: paymentId, status: 'PENDING' },
      data: { status: 'FAILED', ...(raw ? { rawResponse: raw } : {}) },
    });
  }

  // ------------------------------------------------------------ Tâches périodiques

  async runPeriodicJobs() {
    if (this.jobRunning) return;
    this.jobRunning = true;
    try {
      await this.expireUnpaidReservations();
      await this.sendDepartureReminders();
    } catch (error: any) {
      this.logger.error('Ticketing periodic jobs failed', error?.stack || String(error));
    } finally {
      this.jobRunning = false;
    }
  }

  async expireUnpaidReservations() {
    const expired = await this.prisma.ticketReservation.findMany({
      where: { status: 'PENDING_PAYMENT', expiresAt: { lt: new Date() } },
      select: { id: true, payment: { select: { id: true, status: true } } },
      take: 200,
    });

    for (const reservation of expired) {
      // Dernière vérification : le client a peut-être payé à la dernière seconde
      if (reservation.payment?.status === 'PENDING') {
        try {
          await this.syncWithProvider(reservation.payment.id);
        } catch (error: any) {
          this.logger.warn(`Payment verification failed for ${reservation.payment.id}: ${error?.message}`);
        }
      }
      await this.releaseReservation(reservation.id, 'EXPIRED');
    }
  }

  async sendDepartureReminders() {
    const now = new Date();
    const windowMinutes = envInt('TICKETING_REMINDER_MINUTES', 120);
    const trips = await this.prisma.trip.findMany({
      where: {
        status: 'SCHEDULED',
        reminderSentAt: null,
        departureAt: { gt: now, lte: new Date(now.getTime() + windowMinutes * 60 * 1000) },
      },
      include: { station: { select: { name: true, city: true, company: { select: { name: true } } } } },
      take: 100,
    });

    for (const trip of trips) {
      // Réservation atomique du rappel : une seule instance l'envoie
      const claimed = await this.prisma.trip.updateMany({
        where: { id: trip.id, reminderSentAt: null },
        data: { reminderSentAt: now },
      });
      if (claimed.count === 0) continue;

      const reservations = await this.prisma.ticketReservation.findMany({
        where: { tripId: trip.id, status: 'CONFIRMED' },
        select: { passengerPhone: true, code: true },
      });
      await Promise.all(
        reservations.map((r) =>
          this.notifications.sendSms(
            r.passengerPhone,
            `URCO rappel: départ ${trip.station.city} -> ${trip.destinationCity} (${trip.station.company.name}) ` +
              `le ${formatDeparture(trip.departureAt)} depuis ${trip.station.name}. Billet ${r.code}.`,
          ),
        ),
      );
    }
  }

  // ------------------------------------------------------------ Helpers

  private async getBookableTrip(tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: {
        id: tripId,
        status: 'SCHEDULED',
        departureAt: { gt: new Date() },
        station: { active: true, company: { status: 'ACTIVE' } },
      },
      include: { station: { select: { companyId: true } } },
    });
    if (!trip) {
      throw new NotFoundException('Trajet introuvable ou plus réservable');
    }
    return trip;
  }

  /** Décrément atomique : aucune survente possible, même en cas de réservations simultanées. */
  private async holdSeats(tx: Prisma.TransactionClient, tripId: string, seats: number) {
    const result = await tx.trip.updateMany({
      where: { id: tripId, status: 'SCHEDULED', availableSeats: { gte: seats } },
      data: { availableSeats: { decrement: seats } },
    });
    if (result.count === 0) {
      throw new BadRequestException('Nombre de places disponibles insuffisant');
    }
  }

  /** Libère les places d'une réservation non payée. Retourne false si elle n'était plus en attente. */
  private async releaseReservation(reservationId: string, status: 'EXPIRED' | 'CANCELLED') {
    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.ticketReservation.findUnique({ where: { id: reservationId } });
      if (!reservation) return false;
      const updated = await tx.ticketReservation.updateMany({
        where: { id: reservationId, status: 'PENDING_PAYMENT' },
        data: { status, ...(status === 'CANCELLED' ? { cancelledAt: new Date() } : {}) },
      });
      if (updated.count === 0) return false;
      await tx.trip.update({
        where: { id: reservation.tripId },
        data: { availableSeats: { increment: reservation.seats } },
      });
      await tx.ticketPayment.updateMany({
        where: { reservationId, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      return true;
    });
  }

  private async getOwned(userId: string, reservationId: string): Promise<ReservationWithTrip> {
    const reservation = await this.prisma.ticketReservation.findUnique({
      where: { id: reservationId },
      include: RESERVATION_INCLUDE,
    });
    if (!reservation || reservation.userId !== userId) {
      throw new NotFoundException('Réservation introuvable');
    }
    return reservation;
  }

  private async withUniqueCode<T>(run: (code: string) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await run(generateReservationCode());
      } catch (error: any) {
        if (error?.code === 'P2002' && String(error?.meta?.target ?? '').includes('code')) {
          continue;
        }
        throw error;
      }
    }
    throw new BadRequestException('Impossible de générer un code de réservation, réessayez');
  }

  /** Billet numérique : le code et le QR ne sont exposés qu'une fois le paiement validé. */
  present(reservation: ReservationWithTrip) {
    const hasTicket = reservation.status === 'CONFIRMED' || reservation.status === 'USED';
    const { trip } = reservation;
    return {
      ...reservation,
      code: hasTicket ? reservation.code : null,
      ticket: hasTicket
        ? {
            code: reservation.code,
            qrPayload: buildQrPayload(reservation.code!),
            company: trip.station.company,
            departureStation: { id: trip.station.id, name: trip.station.name, city: trip.station.city, address: trip.station.address },
            arrivalStation: trip.arrivalStation,
            destinationCity: trip.destinationCity,
            departureAt: trip.departureAt,
            vehicleType: trip.vehicleType,
            seats: reservation.seats,
            totalPrice: reservation.totalPrice,
            passengerName: reservation.passengerName,
            conditions: trip.conditions,
          }
        : null,
    };
  }

  private async sendTicket(reservation: ReservationWithTrip) {
    const { trip } = reservation;
    const company = trip.station.company.name;
    await Promise.all([
      this.notifications.sendSms(
        reservation.passengerPhone,
        `URCO: paiement confirmé. Billet ${reservation.code} - ${company} ${trip.station.city} -> ${trip.destinationCity} ` +
          `le ${formatDeparture(trip.departureAt)}, gare ${trip.station.name}, ${reservation.seats} place(s).`,
      ),
      this.notifications.sendEmail(
        reservation.passengerEmail,
        `URCO - Votre billet ${reservation.code}`,
        `
          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
            <img src="${escapeHtml(trip.station.company.logo)}" alt="${escapeHtml(company)}" style="max-height: 60px;" />
            <h2 style="color: #333;">Votre billet ${escapeHtml(company)}</h2>
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 3px; margin: 20px 0;">
              ${reservation.code}
            </div>
            <p><strong>Trajet :</strong> ${escapeHtml(trip.station.city)} → ${escapeHtml(trip.destinationCity)}<br/>
            <strong>Départ :</strong> ${formatDeparture(trip.departureAt)} - ${escapeHtml(trip.station.name)}<br/>
            <strong>Passager :</strong> ${escapeHtml(reservation.passengerName)} - ${reservation.seats} place(s)<br/>
            <strong>Montant :</strong> ${reservation.totalPrice} FCFA</p>
            ${trip.conditions ? `<p style="color: #666; font-size: 13px;"><strong>Conditions :</strong> ${escapeHtml(trip.conditions)}</p>` : ''}
          </div>
        `,
      ),
    ]);
  }
}
