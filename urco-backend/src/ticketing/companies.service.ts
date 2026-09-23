import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { TicketingAuditService } from './ticketing-audit.service';
import { TicketingNotificationsService } from './ticketing-notifications.service';
import {
  CreateCompanyDto,
  CreateInspectorDto,
  CreateStationDto,
  UpdateCompanyDto,
  UpdateCompanyStatusDto,
  UpdateInspectorDto,
  UpdateOwnStationDto,
  UpdateStationDto,
} from './dto/ticketing.dto';
import {
  generateInspectorLoginId,
  generatePassword,
  generateStationLoginId,
  normalizeCity,
} from './ticketing.utils';

export interface AuthUser {
  id: string;
  isAdmin?: boolean;
}

// Champs d'une gare exposables (jamais le hash du mot de passe)
export const STATION_PUBLIC_SELECT = {
  id: true,
  companyId: true,
  name: true,
  city: true,
  address: true,
  lat: true,
  lng: true,
  openingHours: true,
  phone: true,
} satisfies Prisma.StationSelect;

const STATION_ADMIN_SELECT = {
  ...STATION_PUBLIC_SELECT,
  email: true,
  loginId: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StationSelect;

const INSPECTOR_SELECT = {
  id: true,
  companyId: true,
  name: true,
  phone: true,
  email: true,
  loginId: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TicketInspectorSelect;

@Injectable()
export class CompaniesService {
  constructor(
    private prisma: PrismaService,
    private audit: TicketingAuditService,
    private notifications: TicketingNotificationsService,
  ) {}

  // ------------------------------------------------------------ Accès

  /** Vérifie que l'utilisateur administre la compagnie (propriétaire ou admin plateforme). */
  async assertCompanyAdmin(user: AuthUser, companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('Compagnie introuvable');
    }
    if (company.ownerId !== user.id && !user.isAdmin) {
      throw new ForbiddenException('Vous n\'administrez pas cette compagnie');
    }
    return company;
  }

  async assertStationOfCompany(companyId: string, stationId: string) {
    const station = await this.prisma.station.findUnique({ where: { id: stationId } });
    if (!station || station.companyId !== companyId) {
      throw new NotFoundException('Gare introuvable pour cette compagnie');
    }
    return station;
  }

  private actorType(user: AuthUser) {
    return user.isAdmin ? ('PLATFORM_ADMIN' as const) : ('COMPANY_ADMIN' as const);
  }

  // ------------------------------------------------------------ Compagnie

  async createCompany(user: AuthUser, dto: CreateCompanyDto, logoPath?: string) {
    const logo = logoPath || dto.logoUrl;
    if (!logo) {
      throw new BadRequestException('Le logo de la compagnie est obligatoire');
    }

    try {
      const company = await this.prisma.company.create({
        data: {
          ownerId: user.id,
          name: dto.name.trim(),
          logo,
          description: dto.description,
          email: dto.email,
          phone: dto.phone,
          whatsapp: dto.whatsapp,
          coveredCities: (dto.coveredCities ?? []).map(normalizeCity),
          tripEditCutoffMinutes: dto.tripEditCutoffMinutes,
          // Une compagnie créée par un admin plateforme est active d'emblée
          status: user.isAdmin ? 'ACTIVE' : 'PENDING',
        },
      });
      await this.audit.log({
        actorType: this.actorType(user),
        actorId: user.id,
        companyId: company.id,
        action: 'COMPANY_CREATED',
        entity: 'Company',
        entityId: company.id,
      });
      return company;
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException('Une compagnie porte déjà ce nom');
      }
      throw error;
    }
  }

  async listMyCompanies(user: AuthUser) {
    return this.prisma.company.findMany({
      where: { ownerId: user.id },
      include: { _count: { select: { stations: true, inspectors: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCompanyForAdmin(user: AuthUser, companyId: string) {
    await this.assertCompanyAdmin(user, companyId);
    return this.prisma.company.findUnique({
      where: { id: companyId },
      include: { stations: { select: STATION_ADMIN_SELECT, orderBy: { name: 'asc' } } },
    });
  }

  async updateCompany(user: AuthUser, companyId: string, dto: UpdateCompanyDto, logoPath?: string) {
    await this.assertCompanyAdmin(user, companyId);
    const { logoUrl, coveredCities, ...rest } = dto;
    const logo = logoPath || logoUrl;

    try {
      const company = await this.prisma.company.update({
        where: { id: companyId },
        data: {
          ...rest,
          ...(rest.name ? { name: rest.name.trim() } : {}),
          ...(logo ? { logo } : {}),
          ...(coveredCities ? { coveredCities: coveredCities.map(normalizeCity) } : {}),
        },
      });
      await this.audit.log({
        actorType: this.actorType(user),
        actorId: user.id,
        companyId,
        action: 'COMPANY_UPDATED',
        entity: 'Company',
        entityId: companyId,
        data: { fields: Object.keys(dto) },
      });
      return company;
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException('Une compagnie porte déjà ce nom');
      }
      throw error;
    }
  }

  async listAllCompanies(status?: string) {
    return this.prisma.company.findMany({
      where: status ? { status: status as any } : undefined,
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        _count: { select: { stations: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateCompanyStatus(adminId: string, companyId: string, dto: UpdateCompanyStatusDto) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('Compagnie introuvable');
    }
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: { status: dto.status },
    });
    await this.audit.log({
      actorType: 'PLATFORM_ADMIN',
      actorId: adminId,
      companyId,
      action: 'COMPANY_STATUS_CHANGED',
      entity: 'Company',
      entityId: companyId,
      data: { from: company.status, to: dto.status },
    });
    return updated;
  }

  // ------------------------------------------------------------ Public

  async listCities() {
    const stations = await this.prisma.station.findMany({
      where: { active: true, company: { status: 'ACTIVE' } },
      select: { city: true },
      distinct: ['city'],
      orderBy: { city: 'asc' },
    });
    return stations.map((s) => s.city);
  }

  async listPublicCompanies(city?: string) {
    return this.prisma.company.findMany({
      where: {
        status: 'ACTIVE',
        ...(city
          ? { stations: { some: { active: true, city: { equals: normalizeCity(city), mode: 'insensitive' } } } }
          : {}),
      },
      select: {
        id: true,
        name: true,
        logo: true,
        description: true,
        email: true,
        phone: true,
        whatsapp: true,
        coveredCities: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async getPublicCompany(companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        logo: true,
        description: true,
        email: true,
        phone: true,
        whatsapp: true,
        coveredCities: true,
        stations: { where: { active: true }, select: STATION_PUBLIC_SELECT, orderBy: { name: 'asc' } },
      },
    });
    if (!company) {
      throw new NotFoundException('Compagnie introuvable');
    }
    return company;
  }

  async listPublicStations(companyId: string, city?: string) {
    return this.prisma.station.findMany({
      where: {
        companyId,
        active: true,
        company: { status: 'ACTIVE' },
        ...(city ? { city: { equals: normalizeCity(city), mode: 'insensitive' } } : {}),
      },
      select: STATION_PUBLIC_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  // ------------------------------------------------------------ Gares

  async createStation(user: AuthUser, companyId: string, dto: CreateStationDto) {
    const company = await this.assertCompanyAdmin(user, companyId);
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);

    const station = await this.withUniqueLoginId(generateStationLoginId, (loginId) =>
      this.prisma.station.create({
        data: {
          companyId,
          name: dto.name.trim(),
          city: normalizeCity(dto.city),
          address: dto.address,
          lat: dto.lat,
          lng: dto.lng,
          openingHours: dto.openingHours,
          phone: dto.phone,
          email: dto.email,
          loginId,
          passwordHash,
        },
        select: STATION_ADMIN_SELECT,
      }),
    );

    // La ville de la gare fait partie des villes couvertes
    if (!company.coveredCities.includes(station.city)) {
      await this.prisma.company.update({
        where: { id: companyId },
        data: { coveredCities: { push: station.city } },
      });
    }

    const delivery = await this.sendCredentials(company.name, station.name, station.loginId, password, dto.phone, dto.email);

    await this.audit.log({
      actorType: this.actorType(user),
      actorId: user.id,
      companyId,
      action: 'STATION_CREATED',
      entity: 'Station',
      entityId: station.id,
      data: { delivery },
    });

    // Le mot de passe en clair n'est renvoyé qu'ici : il n'est stocké que hashé.
    return { station, credentials: { loginId: station.loginId, password, role: 'STATION_AGENT' }, delivery };
  }

  async listStations(user: AuthUser, companyId: string) {
    await this.assertCompanyAdmin(user, companyId);
    return this.prisma.station.findMany({
      where: { companyId },
      select: { ...STATION_ADMIN_SELECT, _count: { select: { trips: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async getStation(user: AuthUser, companyId: string, stationId: string) {
    await this.assertCompanyAdmin(user, companyId);
    await this.assertStationOfCompany(companyId, stationId);
    return this.prisma.station.findUnique({ where: { id: stationId }, select: STATION_ADMIN_SELECT });
  }

  async updateStation(user: AuthUser, companyId: string, stationId: string, dto: UpdateStationDto) {
    await this.assertCompanyAdmin(user, companyId);
    await this.assertStationOfCompany(companyId, stationId);
    const station = await this.prisma.station.update({
      where: { id: stationId },
      data: { ...dto, ...(dto.city ? { city: normalizeCity(dto.city) } : {}) },
      select: STATION_ADMIN_SELECT,
    });
    await this.audit.log({
      actorType: this.actorType(user),
      actorId: user.id,
      companyId,
      action: 'STATION_UPDATED',
      entity: 'Station',
      entityId: stationId,
      data: { fields: Object.keys(dto) },
    });
    return station;
  }

  async updateOwnStation(stationId: string, dto: UpdateOwnStationDto) {
    const station = await this.prisma.station.update({
      where: { id: stationId },
      data: dto,
      select: STATION_PUBLIC_SELECT,
    });
    await this.audit.log({
      actorType: 'STATION_AGENT',
      actorId: stationId,
      companyId: station.companyId,
      action: 'STATION_UPDATED',
      entity: 'Station',
      entityId: stationId,
      data: { fields: Object.keys(dto) },
    });
    return station;
  }

  async getOwnStation(stationId: string) {
    return this.prisma.station.findUnique({
      where: { id: stationId },
      select: {
        ...STATION_PUBLIC_SELECT,
        loginId: true,
        company: { select: { id: true, name: true, logo: true, tripEditCutoffMinutes: true } },
      },
    });
  }

  async deleteStation(user: AuthUser, companyId: string, stationId: string) {
    await this.assertCompanyAdmin(user, companyId);
    await this.assertStationOfCompany(companyId, stationId);

    const activeReservations = await this.prisma.ticketReservation.count({
      where: {
        trip: { stationId, departureAt: { gte: new Date() } },
        status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] },
      },
    });
    if (activeReservations > 0) {
      throw new BadRequestException(
        'Cette gare a des réservations à venir : désactivez-la ou annulez ses trajets avant suppression',
      );
    }

    await this.prisma.station.delete({ where: { id: stationId } });
    await this.audit.log({
      actorType: this.actorType(user),
      actorId: user.id,
      companyId,
      action: 'STATION_DELETED',
      entity: 'Station',
      entityId: stationId,
    });
    return { message: 'Gare supprimée' };
  }

  async resetStationAccess(user: AuthUser, companyId: string, stationId: string) {
    const company = await this.assertCompanyAdmin(user, companyId);
    const existing = await this.assertStationOfCompany(companyId, stationId);
    const password = generatePassword();

    const station = await this.prisma.station.update({
      where: { id: stationId },
      data: { passwordHash: await bcrypt.hash(password, 10), tokenVersion: { increment: 1 } },
      select: STATION_ADMIN_SELECT,
    });

    const delivery = await this.sendCredentials(company.name, station.name, station.loginId, password, existing.phone, existing.email);

    await this.audit.log({
      actorType: this.actorType(user),
      actorId: user.id,
      companyId,
      action: 'STATION_ACCESS_RESET',
      entity: 'Station',
      entityId: stationId,
      data: { delivery },
    });

    return { station, credentials: { loginId: station.loginId, password, role: 'STATION_AGENT' }, delivery };
  }

  // ------------------------------------------------------------ Contrôleurs

  async createInspector(user: AuthUser, companyId: string, dto: CreateInspectorDto) {
    const company = await this.assertCompanyAdmin(user, companyId);
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);

    const inspector = await this.withUniqueLoginId(generateInspectorLoginId, (loginId) =>
      this.prisma.ticketInspector.create({
        data: { companyId, name: dto.name.trim(), phone: dto.phone, email: dto.email, loginId, passwordHash },
        select: INSPECTOR_SELECT,
      }),
    );

    const delivery = await this.sendCredentials(company.name, `Contrôleur ${inspector.name}`, inspector.loginId, password, dto.phone, dto.email);

    await this.audit.log({
      actorType: this.actorType(user),
      actorId: user.id,
      companyId,
      action: 'INSPECTOR_CREATED',
      entity: 'TicketInspector',
      entityId: inspector.id,
      data: { delivery },
    });

    return { inspector, credentials: { loginId: inspector.loginId, password, role: 'INSPECTOR' }, delivery };
  }

  async listInspectors(user: AuthUser, companyId: string) {
    await this.assertCompanyAdmin(user, companyId);
    return this.prisma.ticketInspector.findMany({
      where: { companyId },
      select: INSPECTOR_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  private async assertInspectorOfCompany(companyId: string, inspectorId: string) {
    const inspector = await this.prisma.ticketInspector.findUnique({ where: { id: inspectorId } });
    if (!inspector || inspector.companyId !== companyId) {
      throw new NotFoundException('Contrôleur introuvable pour cette compagnie');
    }
    return inspector;
  }

  async updateInspector(user: AuthUser, companyId: string, inspectorId: string, dto: UpdateInspectorDto) {
    await this.assertCompanyAdmin(user, companyId);
    await this.assertInspectorOfCompany(companyId, inspectorId);
    const inspector = await this.prisma.ticketInspector.update({
      where: { id: inspectorId },
      data: dto,
      select: INSPECTOR_SELECT,
    });
    await this.audit.log({
      actorType: this.actorType(user),
      actorId: user.id,
      companyId,
      action: 'INSPECTOR_UPDATED',
      entity: 'TicketInspector',
      entityId: inspectorId,
      data: { fields: Object.keys(dto) },
    });
    return inspector;
  }

  async deleteInspector(user: AuthUser, companyId: string, inspectorId: string) {
    await this.assertCompanyAdmin(user, companyId);
    await this.assertInspectorOfCompany(companyId, inspectorId);
    await this.prisma.ticketInspector.delete({ where: { id: inspectorId } });
    await this.audit.log({
      actorType: this.actorType(user),
      actorId: user.id,
      companyId,
      action: 'INSPECTOR_DELETED',
      entity: 'TicketInspector',
      entityId: inspectorId,
    });
    return { message: 'Contrôleur supprimé' };
  }

  async resetInspectorAccess(user: AuthUser, companyId: string, inspectorId: string) {
    const company = await this.assertCompanyAdmin(user, companyId);
    const existing = await this.assertInspectorOfCompany(companyId, inspectorId);
    const password = generatePassword();

    const inspector = await this.prisma.ticketInspector.update({
      where: { id: inspectorId },
      data: { passwordHash: await bcrypt.hash(password, 10), tokenVersion: { increment: 1 } },
      select: INSPECTOR_SELECT,
    });

    const delivery = await this.sendCredentials(company.name, `Contrôleur ${inspector.name}`, inspector.loginId, password, existing.phone, existing.email);

    await this.audit.log({
      actorType: this.actorType(user),
      actorId: user.id,
      companyId,
      action: 'INSPECTOR_ACCESS_RESET',
      entity: 'TicketInspector',
      entityId: inspectorId,
      data: { delivery },
    });

    return { inspector, credentials: { loginId: inspector.loginId, password, role: 'INSPECTOR' }, delivery };
  }

  // ------------------------------------------------------------ Journal

  async listAuditLogs(user: AuthUser, companyId: string, page = 1, limit = 50) {
    await this.assertCompanyAdmin(user, companyId);
    const [data, total] = await Promise.all([
      this.prisma.ticketingAuditLog.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ticketingAuditLog.count({ where: { companyId } }),
    ]);
    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // ------------------------------------------------------------ Helpers

  private async withUniqueLoginId<T>(generate: () => string, create: (loginId: string) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await create(generate());
      } catch (error: any) {
        if (error?.code === 'P2002' && String(error?.meta?.target ?? '').includes('loginId')) {
          continue;
        }
        throw error;
      }
    }
    throw new BadRequestException('Impossible de générer un identifiant unique, réessayez');
  }

  private async sendCredentials(
    companyName: string,
    label: string,
    loginId: string,
    password: string,
    phone?: string | null,
    email?: string | null,
  ) {
    const [sms, mail] = await Promise.all([
      this.notifications.sendSms(
        phone,
        `URCO ${companyName} - ${label}. Identifiant: ${loginId} Mot de passe: ${password}. Changez-le dès que possible.`,
      ),
      this.notifications.sendEmail(
        email,
        `URCO - Vos accès (${companyName})`,
        `
          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">${escapeHtml(companyName)} - ${escapeHtml(label)}</h2>
            <p>Voici vos identifiants de connexion URCO Billetterie :</p>
            <p><strong>Identifiant :</strong> ${loginId}<br/><strong>Mot de passe :</strong> ${password}</p>
            <p style="color: #999; font-size: 12px;">Ne communiquez jamais ces identifiants.</p>
          </div>
        `,
      ),
    ]);
    return { sms, email: mail };
  }
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
