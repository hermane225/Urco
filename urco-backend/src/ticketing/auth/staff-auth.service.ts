import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { TicketingAuditService } from '../ticketing-audit.service';
import { StaffPrincipal } from './staff-jwt.strategy';

@Injectable()
export class StaffAuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private audit: TicketingAuditService,
  ) {}

  async loginStation(loginId: string, password: string) {
    const station = await this.prisma.station.findUnique({
      where: { loginId: loginId.trim().toUpperCase() },
      include: { company: { select: { id: true, name: true, logo: true, status: true } } },
    });

    // Même message quel que soit le motif, pour ne pas révéler les identifiants existants
    if (
      !station ||
      !station.active ||
      station.company.status === 'SUSPENDED' ||
      !(await bcrypt.compare(password, station.passwordHash))
    ) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    await this.audit.log({
      actorType: 'STATION_AGENT',
      actorId: station.id,
      companyId: station.companyId,
      action: 'STATION_LOGIN',
      entity: 'Station',
      entityId: station.id,
    });

    const { passwordHash, tokenVersion, ...safeStation } = station;
    return {
      token: this.jwtService.sign({ sub: station.id, type: 'station', companyId: station.companyId, tv: tokenVersion }),
      role: 'STATION_AGENT',
      station: safeStation,
    };
  }

  async loginInspector(loginId: string, password: string) {
    const inspector = await this.prisma.ticketInspector.findUnique({
      where: { loginId: loginId.trim().toUpperCase() },
      include: { company: { select: { id: true, name: true, logo: true, status: true } } },
    });

    if (
      !inspector ||
      !inspector.active ||
      inspector.company.status === 'SUSPENDED' ||
      !(await bcrypt.compare(password, inspector.passwordHash))
    ) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    await this.audit.log({
      actorType: 'INSPECTOR',
      actorId: inspector.id,
      companyId: inspector.companyId,
      action: 'INSPECTOR_LOGIN',
      entity: 'TicketInspector',
      entityId: inspector.id,
    });

    const { passwordHash, tokenVersion, ...safeInspector } = inspector;
    return {
      token: this.jwtService.sign({ sub: inspector.id, type: 'inspector', companyId: inspector.companyId, tv: tokenVersion }),
      role: 'INSPECTOR',
      inspector: safeInspector,
    };
  }

  /** Change le mot de passe et renvoie un nouveau jeton (les autres sessions sont révoquées). */
  async changePassword(principal: StaffPrincipal, currentPassword: string, newPassword: string) {
    if (newPassword.length < 8) {
      throw new BadRequestException('Le mot de passe doit contenir au moins 8 caractères');
    }
    const account =
      principal.type === 'station'
        ? await this.prisma.station.findUnique({ where: { id: principal.id } })
        : await this.prisma.ticketInspector.findUnique({ where: { id: principal.id } });
    if (!account || !(await bcrypt.compare(currentPassword, account.passwordHash))) {
      throw new UnauthorizedException('Mot de passe actuel incorrect');
    }

    const data = { passwordHash: await bcrypt.hash(newPassword, 10), tokenVersion: { increment: 1 } };
    const updated =
      principal.type === 'station'
        ? await this.prisma.station.update({ where: { id: principal.id }, data })
        : await this.prisma.ticketInspector.update({ where: { id: principal.id }, data });

    await this.audit.log({
      actorType: principal.type === 'station' ? 'STATION_AGENT' : 'INSPECTOR',
      actorId: principal.id,
      companyId: principal.companyId,
      action: 'STAFF_PASSWORD_CHANGED',
      entity: principal.type === 'station' ? 'Station' : 'TicketInspector',
      entityId: principal.id,
    });

    return {
      message: 'Mot de passe modifié',
      token: this.jwtService.sign({
        sub: principal.id,
        type: principal.type,
        companyId: principal.companyId,
        tv: updated.tokenVersion,
      }),
    };
  }
}
