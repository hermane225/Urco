import { Module } from '@nestjs/common';
import { RidesService } from './rides.service';
import { RidesController } from './rides.controller';
import { RidesEventsService } from './rides-events.service';
import { RidesTrackingService } from './rides-tracking.service';
import { RidesGateway } from './rides.gateway';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagesService } from '../messages/messages.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [RidesController],
  providers: [RidesService, RidesEventsService, RidesTrackingService, RidesGateway, MessagesService],
  exports: [RidesService, RidesEventsService, RidesTrackingService],
})
export class RidesModule {}

