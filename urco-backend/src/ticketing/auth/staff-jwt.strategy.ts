import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export type StaffType = 'station' | 'inspector';

export interface StaffPrincipal {
  type: StaffType;
  id: string;
  companyId: string;
  /** Renseigné pour un agent de gare uniquement */
  stationId?: string;
}

export const STAFF_JWT_STRATEGY = 'ticketing-staff';

/**
 * Jetons des agents de gare et contrôleurs. Ils portent `type` et `tv`
 * (tokenVersion) : une réinitialisation des accès révoque les sessions en cours.
 * Ils ne sont jamais acceptés par la stratégie JWT utilisateur (sub ≠ User.id).
 */
@Injectable()
export class StaffJwtStrategy extends PassportStrategy(Strategy, STAFF_JWT_STRATEGY) {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET') || 'your-super-secret-jwt-key',
    });
  }

  async validate(payload: any): Promise<StaffPrincipal> {
    if (payload?.type === 'station') {
      const station = await this.prisma.station.findUnique({
        where: { id: payload.sub },
        select: { id: true, companyId: true, active: true, tokenVersion: true, company: { select: { status: true } } },
      });
      if (!station || !station.active || station.tokenVersion !== payload.tv || station.company.status === 'SUSPENDED') {
        throw new UnauthorizedException('Session gare invalide');
      }
      return { type: 'station', id: station.id, companyId: station.companyId, stationId: station.id };
    }

    if (payload?.type === 'inspector') {
      const inspector = await this.prisma.ticketInspector.findUnique({
        where: { id: payload.sub },
        select: { id: true, companyId: true, active: true, tokenVersion: true, company: { select: { status: true } } },
      });
      if (!inspector || !inspector.active || inspector.tokenVersion !== payload.tv || inspector.company.status === 'SUSPENDED') {
        throw new UnauthorizedException('Session contrôleur invalide');
      }
      return { type: 'inspector', id: inspector.id, companyId: inspector.companyId };
    }

    throw new UnauthorizedException('Invalid token');
  }
}
