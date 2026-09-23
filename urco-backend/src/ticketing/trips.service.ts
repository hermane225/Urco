import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TicketingActorType, Trip } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TicketingAuditService } from './ticketing-audit.service';
import { TicketingNotificationsService } from './ticketing-notifications.service';
import { CreateTripDto, TripSearchQuery, UpdateTripDto } from './dto/ticketing.dto';
import { normalizeCity } from './ticketing.utils';

export interface TripActor {
  type: TicketingActorType;
  id: string;
  companyId: string;
}

const TRIP_PUBLIC_INCLUDE = {
  station: {
    select: {
      id: true,
      name: true,
      city: true,
      address: true,
      company: { select: { id: true, name: true, logo: true } },
    },
  },
  arrivalStation: { select: { id: true, name: true, city: true, address: true } },
} satisfies Prisma.TripInclude;

// Champs dont la modification doit être notifiée aux passagers
const PASSENGER_VISIBLE_FIELDS = ['departureAt', 'destinationCity', 'arrivalStationId', 'vehicleType'] as const;

function dayBounds(date: string) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { gte: start, lt: end };
}

@Injectable()
export class TripsService {
  constructor(
    private prisma: PrismaService,
    private audit: TicketingAuditService,
    private notifications: TicketingNotificationsService,
  ) {}

  // ------------------------------------------------------------ Public

  async search(query: TripSearchQuery) {
    const where: Prisma.TripWhereInput = {
      status: 'SCHEDULED',
      availableSeats: { gt: 0 },
      departureAt: query.date ? { ...dayBounds(query.date), gt: new Date() } : { gt: new Date() },
      station: {
        active: true,
        company: { status: 'ACTIVE', ...(query.companyId ? { id: query.companyId } : {}) },
        ...(query.from ? { city: { equals: normalizeCity(query.from), mode: 'insensitive' } } : {}),
      },
      ...(query.stationId ? { stationId: query.stationId } : {}),
      ...(query.to ? { destinationCity: { equals: normalizeCity(query.to), mode: 'insensitive' } } : {}),
    };

    return this.prisma.trip.findMany({
      where,
      include: TRIP_PUBLIC_INCLUDE,
      orderBy: { departureAt: 'asc' },
      take: 200,
    });
  }

  async getPublicTrip(tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, station: { company: { status: 'ACTIVE' } } },
      include: TRIP_PUBLIC_INCLUDE,
    });
    if (!trip) {
      throw new NotFoundException('Trajet introuvable');
    }
    return trip;
  }

  // ------------------------------------------------------------ Gestion

  /** Liste les trajets d'une compagnie (optionnellement d'une gare). */
  async listForCompany(companyId: string, opts: { stationId?: string; date?: string; from?: string; to?: string; status?: string }) {
    const departureAt: Prisma.DateTimeFilter = {};
    if (opts.date) Object.assign(departureAt, dayBounds(opts.date));
    if (opts.from) departureAt.gte = new Date(`${opts.from}T00:00:00.000Z`);
    if (opts.to) departureAt.lt = new Date(new Date(`${opts.to}T00:00:00.000Z`).getTime() + 86400000);

    return this.prisma.trip.findMany({
      where: {
        station: { companyId },
        ...(opts.stationId ? { stationId: opts.stationId } : {}),
        ...(opts.status ? { status: opts.status as any } : {}),
        ...(Object.keys(departureAt).length ? { departureAt } : {}),
      },
      include: {
        ...TRIP_PUBLIC_INCLUDE,
        _count: { select: { reservations: { where: { status: { in: ['CONFIRMED', 'USED'] } } } } },
      },
      orderBy: { departureAt: 'asc' },
      take: 500,
    });
  }

  async getTripForCompany(companyId: string, tripId: string, stationId?: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { ...TRIP_PUBLIC_INCLUDE, station: { select: { ...TRIP_PUBLIC_INCLUDE.station.select, companyId: true } } },
    });
    if (!trip || trip.station.companyId !== companyId || (stationId && trip.stationId !== stationId)) {
      throw new NotFoundException('Trajet introuvable');
    }
    return trip;
  }

  async create(actor: TripActor, stationId: string, dto: CreateTripDto) {
    const station = await this.prisma.station.findUnique({ where: { id: stationId } });
    if (!station || station.companyId !== actor.companyId) {
      throw new NotFoundException('Gare introuvable pour cette compagnie');
    }

    const departureAt = new Date(dto.departureAt);
    if (departureAt.getTime() <= Date.now()) {
      throw new BadRequestException('La date de départ doit être dans le futur');
    }
    await this.assertArrivalStation(actor.companyId, stationId, dto.arrivalStationId);

    const trip = await this.prisma.trip.create({
      data: {
        stationId,
        arrivalStationId: dto.arrivalStationId,
        destinationCity: normalizeCity(dto.destinationCity),
        departureAt,
        vehicleType: dto.vehicleType,
        totalSeats: dto.totalSeats,
        availableSeats: dto.totalSeats,
        price: dto.price,
        conditions: dto.conditions,
      },
      include: TRIP_PUBLIC_INCLUDE,
    });

    await this.audit.log({
      actorType: actor.type,
      actorId: actor.id,
      companyId: actor.companyId,
      action: 'TRIP_CREATED',
      entity: 'Trip',
      entityId: trip.id,
    });
    return trip;
  }

  async update(actor: TripActor, tripId: string, dto: UpdateTripDto, restrictToStationId?: string) {
    const existing = await this.getTripForCompany(actor.companyId, tripId, restrictToStationId);
    if (existing.status !== 'SCHEDULED') {
      throw new BadRequestException('Seul un trajet programmé peut être modifié');
    }
    await this.assertEditable(existing, actor.companyId);

    const data: Prisma.TripUpdateInput = {};
    if (dto.destinationCity !== undefined) data.destinationCity = normalizeCity(dto.destinationCity);
    if (dto.vehicleType !== undefined) data.vehicleType = dto.vehicleType;
    if (dto.price !== undefined) data.price = dto.price; // n'affecte que les nouvelles réservations
    if (dto.conditions !== undefined) data.conditions = dto.conditions;
    if (dto.arrivalStationId !== undefined) {
      await this.assertArrivalStation(actor.companyId, existing.stationId, dto.arrivalStationId);
      data.arrivalStation = { connect: { id: dto.arrivalStationId } };
    }
    if (dto.departureAt !== undefined) {
      const departureAt = new Date(dto.departureAt);
      if (departureAt.getTime() <= Date.now()) {
        throw new BadRequestException('La date de départ doit être dans le futur');
      }
      data.departureAt = departureAt;
      data.reminderSentAt = null;
    }

    const trip = await this.prisma.$transaction(async (tx) => {
      if (dto.totalSeats !== undefined && dto.totalSeats !== existing.totalSeats) {
        // Places déjà vendues ou bloquées = total - disponibles : ne jamais descendre en dessous
        const delta = dto.totalSeats - existing.totalSeats;
        const result = await tx.trip.updateMany({
          where: { id: tripId, availableSeats: { gte: Math.max(0, -delta) } },
          data: { totalSeats: dto.totalSeats, availableSeats: { increment: delta } },
        });
        if (result.count === 0) {
          throw new BadRequestException('Le nombre de places ne peut pas être inférieur aux places déjà réservées');
        }
      }
      return tx.trip.update({ where: { id: tripId }, data, include: TRIP_PUBLIC_INCLUDE });
    });

    const changedVisible = PASSENGER_VISIBLE_FIELDS.filter((f) => dto[f] !== undefined);
    if (changedVisible.length > 0) {
      await this.sendToPhones(
        await this.passengerPhones(tripId),
        `URCO: votre trajet ${trip.station.city} -> ${trip.destinationCity} (${trip.station.company.name}) a été modifié. ` +
          `Départ: ${formatDeparture(trip.departureAt)}. Votre billet reste valable.`,
      );
    }

    await this.audit.log({
      actorType: actor.type,
      actorId: actor.id,
      companyId: actor.companyId,
      action: 'TRIP_UPDATED',
      entity: 'Trip',
      entityId: tripId,
      data: { fields: Object.keys(dto) },
    });
    return trip;
  }

  /** Annulation : autorisée jusqu'au départ, même après le délai de modification. */
  async cancel(actor: TripActor, tripId: string, restrictToStationId?: string) {
    const existing = await this.getTripForCompany(actor.companyId, tripId, restrictToStationId);
    if (existing.status !== 'SCHEDULED') {
      throw new BadRequestException('Ce trajet n\'est plus programmé');
    }

    // Seuls les passagers ayant payé sont prévenus (avant que leur statut ne change)
    const paidPhones = await this.passengerPhones(tripId);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.trip.update({ where: { id: tripId }, data: { status: 'CANCELLED' } });
      // Les billets payés passent en remboursement à traiter
      await tx.ticketPayment.updateMany({
        where: { reservation: { tripId }, status: 'PAID' },
        data: { status: 'REFUND_PENDING' },
      });
      await tx.ticketPayment.updateMany({
        where: { reservation: { tripId }, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      await tx.ticketReservation.updateMany({
        where: { tripId, status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] } },
        data: { status: 'CANCELLED', cancelledAt: now },
      });
    });

    await this.sendToPhones(
      paidPhones,
      `URCO: votre trajet ${existing.station.city} -> ${existing.destinationCity} du ${formatDeparture(existing.departureAt)} ` +
        `(${existing.station.company.name}) est annulé. Vous serez remboursé.`,
    );

    await this.audit.log({
      actorType: actor.type,
      actorId: actor.id,
      companyId: actor.companyId,
      action: 'TRIP_CANCELLED',
      entity: 'Trip',
      entityId: tripId,
    });
    return { message: 'Trajet annulé' };
  }

  async remove(actor: TripActor, tripId: string) {
    await this.getTripForCompany(actor.companyId, tripId);
    const reservations = await this.prisma.ticketReservation.count({ where: { tripId } });
    if (reservations > 0) {
      throw new BadRequestException('Ce trajet a des réservations : annulez-le au lieu de le supprimer');
    }
    await this.prisma.trip.delete({ where: { id: tripId } });
    await this.audit.log({
      actorType: actor.type,
      actorId: actor.id,
      companyId: actor.companyId,
      action: 'TRIP_DELETED',
      entity: 'Trip',
      entityId: tripId,
    });
    return { message: 'Trajet supprimé' };
  }

  async listPassengers(companyId: string, tripId: string, stationId?: string) {
    await this.getTripForCompany(companyId, tripId, stationId);
    return this.prisma.ticketReservation.findMany({
      where: { tripId, status: { in: ['CONFIRMED', 'USED'] } },
      select: {
        id: true,
        code: true,
        seats: true,
        passengerName: true,
        passengerPhone: true,
        status: true,
        confirmedAt: true,
      },
      orderBy: { passengerName: 'asc' },
    });
  }

  // ------------------------------------------------------------ Helpers

  private async assertEditable(trip: Trip, companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { tripEditCutoffMinutes: true },
    });
    const cutoff = company?.tripEditCutoffMinutes ?? 60;
    if (trip.departureAt.getTime() - Date.now() < cutoff * 60 * 1000) {
      throw new BadRequestException(
        `Un trajet ne peut plus être modifié moins de ${cutoff} minutes avant le départ (seule l'annulation reste possible)`,
      );
    }
  }

  private async assertArrivalStation(companyId: string, departureStationId: string, arrivalStationId?: string) {
    if (!arrivalStationId) return;
    if (arrivalStationId === departureStationId) {
      throw new BadRequestException('La gare d\'arrivée doit être différente de la gare de départ');
    }
    const arrival = await this.prisma.station.findUnique({ where: { id: arrivalStationId } });
    if (!arrival || arrival.companyId !== companyId) {
      throw new BadRequestException('Gare d\'arrivée introuvable pour cette compagnie');
    }
  }

  private async passengerPhones(tripId: string): Promise<string[]> {
    const reservations = await this.prisma.ticketReservation.findMany({
      where: { tripId, status: 'CONFIRMED' },
      select: { passengerPhone: true },
    });
    return Array.from(new Set(reservations.map((r) => r.passengerPhone)));
  }

  private async sendToPhones(phones: string[], message: string) {
    await Promise.all(phones.map((phone) => this.notifications.sendSms(phone, message)));
  }
}

export function formatDeparture(date: Date): string {
  const tz = process.env.TICKETING_TIMEZONE || 'Africa/Abidjan';
  return date.toLocaleString('fr-FR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' });
}
