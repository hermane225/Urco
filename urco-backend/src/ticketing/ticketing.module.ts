import { Logger, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { StaffJwtStrategy } from './auth/staff-jwt.strategy';
import { StaffAuthService } from './auth/staff-auth.service';
import { CompaniesService } from './companies.service';
import { TripsService } from './trips.service';
import { ReservationsService } from './reservations.service';
import { TicketsService } from './tickets.service';
import { TicketingStatsService } from './ticketing-stats.service';
import { TicketingAuditService } from './ticketing-audit.service';
import { TicketingNotificationsService } from './ticketing-notifications.service';
import { TICKET_PAYMENT_PROVIDER } from './payment-providers/payment-provider.interface';
import { SandboxPaymentProvider } from './payment-providers/sandbox.provider';
import { PublicTicketingController } from './controllers/public-ticketing.controller';
import { TicketReservationsController } from './controllers/reservations.controller';
import { TicketPaymentsController } from './controllers/ticket-payments.controller';
import { CompanyController } from './controllers/company.controller';
import { StationController } from './controllers/station.controller';
import { InspectorController } from './controllers/inspector.controller';
import { TicketingAdminController } from './controllers/ticketing-admin.controller';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    // Jetons agents/contrôleurs : même secret, durée plus courte (poste partagé au guichet)
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET') || 'your-super-secret-jwt-key',
        signOptions: { expiresIn: configService.get('TICKETING_STAFF_JWT_EXPIRES_IN') || '12h' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    PublicTicketingController,
    TicketReservationsController,
    TicketPaymentsController,
    CompanyController,
    StationController,
    InspectorController,
    TicketingAdminController,
  ],
  providers: [
    StaffJwtStrategy,
    StaffAuthService,
    CompaniesService,
    TripsService,
    ReservationsService,
    TicketsService,
    TicketingStatsService,
    TicketingAuditService,
    TicketingNotificationsService,
    SandboxPaymentProvider,
    {
      // Point d'extension : brancher ici l'agrégateur Mobile Money réel
      provide: TICKET_PAYMENT_PROVIDER,
      useFactory: (sandbox: SandboxPaymentProvider) => {
        const name = process.env.TICKETING_PAYMENT_PROVIDER || 'sandbox';
        if (name !== 'sandbox') {
          throw new Error(`Unknown TICKETING_PAYMENT_PROVIDER "${name}"`);
        }
        if (process.env.NODE_ENV === 'production') {
          new Logger('TicketingModule').warn('Ticketing payments run on the SANDBOX provider: no real money is collected');
        }
        return sandbox;
      },
      inject: [SandboxPaymentProvider],
    },
  ],
})
export class TicketingModule {}
