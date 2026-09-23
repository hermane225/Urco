import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DateRangeQuery } from './dto/ticketing.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class TicketingStatsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Statistiques d'une compagnie, ou d'une seule gare si `stationId` est fourni.
   * Période par défaut : les 30 derniers jours.
   */
  async compute(companyId: string, range: DateRangeQuery, stationId?: string) {
    const to = range.to ? new Date(new Date(`${range.to}T00:00:00.000Z`).getTime() + DAY_MS) : new Date();
    const from = range.from ? new Date(`${range.from}T00:00:00.000Z`) : new Date(to.getTime() - 30 * DAY_MS);

    const stationFilter: Prisma.StationWhereInput = { companyId, ...(stationId ? { id: stationId } : {}) };
    const soldStatuses = { in: ['CONFIRMED', 'USED'] as ('CONFIRMED' | 'USED')[] };

    const [sold, revenue, byMethod, refundPending, trips] = await Promise.all([
      this.prisma.ticketReservation.aggregate({
        where: { status: soldStatuses, confirmedAt: { gte: from, lt: to }, trip: { station: stationFilter } },
        _sum: { seats: true },
        _count: true,
      }),
      this.prisma.ticketPayment.aggregate({
        where: { status: 'PAID', paidAt: { gte: from, lt: to }, station: stationFilter },
        _sum: { amount: true },
      }),
      this.prisma.ticketPayment.groupBy({
        by: ['method'],
        where: { status: 'PAID', paidAt: { gte: from, lt: to }, station: stationFilter },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.ticketPayment.aggregate({
        where: { status: 'REFUND_PENDING', station: stationFilter },
        _sum: { amount: true },
        _count: true,
      }),
      // Taux de remplissage : trajets partis (ou prévus) sur la période, hors annulés
      this.prisma.trip.findMany({
        where: { departureAt: { gte: from, lt: to }, status: { not: 'CANCELLED' }, station: stationFilter },
        select: { id: true, totalSeats: true },
      }),
    ]);

    const tripIds = trips.map((t) => t.id);
    const seatsOffered = trips.reduce((sum, t) => sum + t.totalSeats, 0);
    const seatsSoldOnTrips = tripIds.length
      ? (
          await this.prisma.ticketReservation.aggregate({
            where: { tripId: { in: tripIds }, status: soldStatuses },
            _sum: { seats: true },
          })
        )._sum.seats ?? 0
      : 0;

    const stationSql = stationId ? Prisma.sql`AND s."id" = ${stationId}` : Prisma.empty;
    const popularRoutes = await this.prisma.$queryRaw<
      { from: string; to: string; seats: number; reservations: number; revenue: number }[]
    >`
      SELECT s."city" AS "from", t."destinationCity" AS "to",
             SUM(r."seats")::int AS "seats", COUNT(r."id")::int AS "reservations",
             SUM(r."totalPrice")::int AS "revenue"
      FROM "TicketReservation" r
      JOIN "Trip" t ON t."id" = r."tripId"
      JOIN "Station" s ON s."id" = t."stationId"
      WHERE s."companyId" = ${companyId} ${stationSql}
        AND r."status"::text IN ('CONFIRMED', 'USED')
        AND r."confirmedAt" >= ${from} AND r."confirmedAt" < ${to}
      GROUP BY s."city", t."destinationCity"
      ORDER BY "seats" DESC
      LIMIT 10
    `;

    const result: Record<string, any> = {
      period: { from, to },
      ticketsSold: sold._sum.seats ?? 0,
      reservations: sold._count,
      revenue: revenue._sum.amount ?? 0,
      currency: 'XOF',
      revenueByMethod: byMethod.map((m) => ({ method: m.method, amount: m._sum.amount ?? 0, count: m._count })),
      refundPending: { amount: refundPending._sum.amount ?? 0, count: refundPending._count },
      fillRate: {
        trips: trips.length,
        seatsOffered,
        seatsSold: seatsSoldOnTrips,
        rate: seatsOffered ? Math.round((seatsSoldOnTrips / seatsOffered) * 1000) / 10 : 0,
      },
      popularRoutes,
    };

    // Répartition par gare : réservée à la vue compagnie
    if (!stationId) {
      const [byStation, stations] = await Promise.all([
        this.prisma.ticketPayment.groupBy({
          by: ['stationId'],
          where: { status: 'PAID', paidAt: { gte: from, lt: to }, station: stationFilter },
          _sum: { amount: true },
          _count: true,
        }),
        this.prisma.station.findMany({ where: { companyId }, select: { id: true, name: true, city: true } }),
      ]);
      const totals = new Map(byStation.map((s) => [s.stationId, s]));
      result.byStation = stations
        .map((s) => ({
          ...s,
          revenue: totals.get(s.id)?._sum.amount ?? 0,
          transactions: totals.get(s.id)?._count ?? 0,
        }))
        .sort((a, b) => b.revenue - a.revenue);
    }

    return result;
  }
}
