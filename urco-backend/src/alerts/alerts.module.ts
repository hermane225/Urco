import { Module } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AlertsGateway } from './alerts.gateway';

@Module({
  imports: [PrismaModule],
  controllers: [AlertsController],
  providers: [AlertsService, AlertsGateway],
  exports: [AlertsService, AlertsGateway],
})
export class AlertsModule {}

