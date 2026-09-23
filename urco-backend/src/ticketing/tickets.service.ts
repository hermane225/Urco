import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TicketingAuditService } from './ticketing-audit.service';
import { parseTicketInput } from './ticketing.utils';

export type VerifierActor =
  | { type: 'station'; id: string; companyId: string; stationId: string }
  | { type: 'inspector'; id: string; companyId: string }
  | { type: 'company'; id: string; companyId: string };

export type VerificationResult =
  | 'VALID'
  | 'BOARDED'
  | 'ALREADY_USED'
  | 'NOT_PAID'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'TRIP_CANCELLED'
  | 'WRONG_STATION'
  | 'WRONG_COMPANY'
  | 'INVALID_CODE'
  | 'NOT_FOUND';

const MESSAGES: Record<VerificationResult, string> = {
  VALID: 'Billet valide',
  BOARDED: 'Billet valide - embarquement enregistré',
  ALREADY_USED: 'Billet déjà utilisé',
  NOT_PAID: 'Billet non payé',
  CANCELLED: 'Réservation annulée',
  EXPIRED: 'Réservation expirée',
  TRIP_CANCELLED: 'Trajet annulé',
  WRONG_STATION: 'Ce billet ne part pas de cette gare',
  WRONG_COMPANY: 'Ce billet n\'appartient pas à votre compagnie',
  INVALID_CODE: 'Code invalide ou QR code falsifié',
  NOT_FOUND: 'Billet introuvable',
};

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private audit: TicketingAuditService,
  ) {}

  /**
   * Vérifie un billet. Seul un agent de gare peut enregistrer l'embarquement
   * (`board`) ; contrôleur et compagnie sont en lecture seule.
   */
  async verify(actor: VerifierActor, input: string, board = false) {
    const code = parseTicketInput(input);
    if (!code) {
      await this.logAttempt(actor, 'INVALID_CODE', null, { input: String(input).slice(0, 64) });
      return this.response('INVALID_CODE');
    }

    const reservation = await this.prisma.ticketReservation.findUnique({
      where: { code },
      include: {
        trip: {
          include: {
            station: { select: { id: true, name: true, city: true, companyId: true, company: { select: { name: true, logo: true } } } },
            arrivalStation: { select: { id: true, name: true, city: true } },
          },
        },
      },
    });

    if (!reservation) {
      await this.logAttempt(actor, 'NOT_FOUND', null, { code });
      return this.response('NOT_FOUND');
    }

    // Ne rien divulguer d'un billet d'une autre compagnie
    if (reservation.trip.station.companyId !== actor.companyId) {
      await this.record(actor, reservation.id, 'WRONG_COMPANY', false);
      return this.response('WRONG_COMPANY');
    }

    let result = this.statusResult(reservation.status, reservation.trip.status);

    if (result === 'VALID' && actor.type === 'station' && reservation.trip.stationId !== actor.stationId) {
      result = 'WRONG_STATION';
    }

    if (result === 'VALID' && board && actor.type === 'station') {
      // Atomique : deux scans simultanés ne peuvent pas embarquer le même billet
      const updated = await this.prisma.ticketReservation.updateMany({
        where: { id: reservation.id, status: 'CONFIRMED' },
        data: { status: 'USED' },
      });
      result = updated.count === 1 ? 'BOARDED' : 'ALREADY_USED';
    }

    await this.record(actor, reservation.id, result, result === 'BOARDED');

    const lastBoarding =
      result === 'ALREADY_USED'
        ? await this.prisma.ticketValidation.findFirst({
            where: { reservationId: reservation.id, boarded: true },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true, station: { select: { name: true } } },
          })
        : null;

    const { trip } = reservation;
    return {
      ...this.response(result),
      ticket: {
        code: reservation.code,
        status: result === 'BOARDED' ? 'USED' : reservation.status,
        passengerName: reservation.passengerName,
        passengerPhone: reservation.passengerPhone,
        seats: reservation.seats,
        totalPrice: reservation.totalPrice,
        company: trip.station.company,
        departureStation: { id: trip.station.id, name: trip.station.name, city: trip.station.city },
        arrivalStation: trip.arrivalStation,
        destinationCity: trip.destinationCity,
        departureAt: trip.departureAt,
        vehicleType: trip.vehicleType,
        tripStatus: trip.status,
        conditions: trip.conditions,
      },
      usedAt: lastBoarding?.createdAt ?? null,
      usedAtStation: lastBoarding?.station?.name ?? null,
    };
  }

  async listValidations(
    filter: { stationId?: string; inspectorId?: string; companyId?: string },
    page = 1,
    limit = 50,
  ) {
    const where: Prisma.TicketValidationWhereInput = {
      ...(filter.stationId ? { stationId: filter.stationId } : {}),
      ...(filter.inspectorId ? { inspectorId: filter.inspectorId } : {}),
      ...(filter.companyId
        ? { OR: [{ station: { companyId: filter.companyId } }, { inspector: { companyId: filter.companyId } }] }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.ticketValidation.findMany({
        where,
        include: {
          reservation: {
            select: {
              code: true,
              passengerName: true,
              seats: true,
              trip: { select: { id: true, destinationCity: true, departureAt: true } },
            },
          },
          station: { select: { id: true, name: true } },
          inspector: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ticketValidation.count({ where }),
    ]);
    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  private statusResult(status: string, tripStatus: string): VerificationResult {
    if (tripStatus === 'CANCELLED') return 'TRIP_CANCELLED';
    switch (status) {
      case 'CONFIRMED':
        return 'VALID';
      case 'USED':
        return 'ALREADY_USED';
      case 'PENDING_PAYMENT':
        return 'NOT_PAID';
      case 'CANCELLED':
        return 'CANCELLED';
      default:
        return 'EXPIRED';
    }
  }

  private response(result: VerificationResult) {
    return { valid: result === 'VALID' || result === 'BOARDED', result, message: MESSAGES[result] };
  }

  private async record(actor: VerifierActor, reservationId: string, result: VerificationResult, boarded: boolean) {
    // Les consultations depuis le tableau de bord compagnie ne sont que journalisées
    if (actor.type !== 'company') {
      await this.prisma.ticketValidation.create({
        data: {
          reservationId,
          result,
          boarded,
          stationId: actor.type === 'station' ? actor.stationId : null,
          inspectorId: actor.type === 'inspector' ? actor.id : null,
        },
      });
    }
    await this.logAttempt(actor, result, reservationId);
  }

  private async logAttempt(actor: VerifierActor, result: VerificationResult, reservationId: string | null, data?: any) {
    await this.audit.log({
      actorType: actor.type === 'station' ? 'STATION_AGENT' : actor.type === 'inspector' ? 'INSPECTOR' : 'COMPANY_ADMIN',
      actorId: actor.id,
      companyId: actor.companyId,
      action: `TICKET_CHECK_${result}`,
      entity: 'TicketReservation',
      entityId: reservationId,
      data,
    });
  }
}
