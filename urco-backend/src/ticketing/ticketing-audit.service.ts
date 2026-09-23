import { Injectable, Logger } from '@nestjs/common';
import { TicketingActorType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorType: TicketingActorType;
  actorId?: string | null;
  companyId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  data?: Record<string, any>;
}

@Injectable()
export class TicketingAuditService {
  private readonly logger = new Logger(TicketingAuditService.name);

  constructor(private prisma: PrismaService) {}

  /** L'audit ne doit jamais bloquer l'action métier : les erreurs sont journalisées. */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.ticketingAuditLog.create({
        data: {
          actorType: entry.actorType,
          actorId: entry.actorId ?? null,
          companyId: entry.companyId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          data: entry.data ?? undefined,
        },
      });
    } catch (error: any) {
      this.logger.error(`Failed to write audit log ${entry.action}`, error?.stack || String(error));
    }
  }
}
