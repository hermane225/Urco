import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { RidesController } from './rides.controller';
import { RidesService } from './rides.service';
import { RidesEventsService } from './rides-events.service';
import { RidesTrackingService } from './rides-tracking.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

class TestJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const isAdmin = req.headers['x-admin'] === 'true';
    req.user = isAdmin
      ? { id: 'admin-1', role: 'ADMIN', roles: ['ADMIN'], isAdmin: true }
      : { id: 'user-1', role: 'PASSENGER', roles: ['PASSENGER'], isAdmin: false };
    return true;
  }
}

describe('Rides Admin Routes', () => {
  let app: INestApplication;
  const ridesServiceMock = {
    getActiveRidesAdmin: jest.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } }),
    getRideFullDetails: jest.fn().mockResolvedValue({ id: 'r1' }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [RidesController],
      providers: [
        { provide: RidesService, useValue: ridesServiceMock },
        { provide: RidesEventsService, useValue: {} },
        { provide: RidesTrackingService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestJwtAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /rides/admin/rides/active should pass for admin', async () => {
    await request(app.getHttpServer())
      .get('/rides/admin/rides/active?page=1&limit=20')
      .set('x-admin', 'true')
      .expect(200);
    expect(ridesServiceMock.getActiveRidesAdmin).toHaveBeenCalledWith(1, 20);
  });

  it('GET /rides/admin/rides/active should fail for non-admin', async () => {
    await request(app.getHttpServer()).get('/rides/admin/rides/active').expect(400);
  });

  it('GET /rides/admin/rides/:rideId/full should pass for admin', async () => {
    await request(app.getHttpServer())
      .get('/rides/admin/rides/r1/full')
      .set('x-admin', 'true')
      .expect(200);
    expect(ridesServiceMock.getRideFullDetails).toHaveBeenCalledWith('r1');
  });

  it('GET /rides/admin/rides/:rideId/full should fail for non-admin', async () => {
    await request(app.getHttpServer()).get('/rides/admin/rides/r1/full').expect(400);
  });
});
