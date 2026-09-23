import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { TicketingModule } from './ticketing.module';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';

describe('Ticketing routes (access isolation)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const prisma: any = {
    station: {
      findMany: jest.fn().mockResolvedValue([{ city: 'Abidjan' }]),
      findUnique: jest.fn(),
    },
    ticketInspector: { findUnique: jest.fn() },
    ticketValidation: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    user: { findUnique: jest.fn() },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), TicketingModule],
      providers: [JwtStrategy],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  const stationToken = (tv = 0) => jwt.sign({ sub: 'station-1', type: 'station', companyId: 'company-1', tv });
  const inspectorToken = () => jwt.sign({ sub: 'insp-1', type: 'inspector', companyId: 'company-1', tv: 0 });

  beforeEach(() => {
    prisma.station.findUnique.mockResolvedValue({
      id: 'station-1',
      companyId: 'company-1',
      active: true,
      tokenVersion: 0,
      company: { status: 'ACTIVE' },
    });
    prisma.ticketInspector.findUnique.mockResolvedValue({
      id: 'insp-1',
      companyId: 'company-1',
      active: true,
      tokenVersion: 0,
      company: { status: 'ACTIVE' },
    });
  });

  it('public cities route needs no auth', async () => {
    await request(app.getHttpServer()).get('/ticketing/cities').expect(200, ['Abidjan']);
  });

  it('station routes reject anonymous calls', async () => {
    await request(app.getHttpServer()).get('/ticketing/station/validations').expect(401);
  });

  it('station routes accept a station token', async () => {
    await request(app.getHttpServer())
      .get('/ticketing/station/validations')
      .set('Authorization', `Bearer ${stationToken()}`)
      .expect(200);
  });

  it('a reset (tokenVersion bump) revokes existing station sessions', async () => {
    await request(app.getHttpServer())
      .get('/ticketing/station/validations')
      .set('Authorization', `Bearer ${stationToken(-1)}`)
      .expect(401);
  });

  it('an inspector token cannot use station routes', async () => {
    await request(app.getHttpServer())
      .get('/ticketing/station/validations')
      .set('Authorization', `Bearer ${inspectorToken()}`)
      .expect(403);
  });

  it('a station token cannot use inspector routes', async () => {
    await request(app.getHttpServer())
      .get('/ticketing/inspector/validations')
      .set('Authorization', `Bearer ${stationToken()}`)
      .expect(403);
  });

  it('a regular user token is rejected on staff routes', async () => {
    const userToken = jwt.sign({ sub: 'user-1', email: 'a@b.c' });
    await request(app.getHttpServer())
      .get('/ticketing/station/validations')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(401);
  });

  it('a station token is rejected on user routes', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get('/ticketing/reservations/mine')
      .set('Authorization', `Bearer ${stationToken()}`)
      .expect(401);
  });
});
