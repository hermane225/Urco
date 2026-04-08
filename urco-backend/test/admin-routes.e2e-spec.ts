import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(60000);

describe('Admin Routes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let createdUserId: string;
  let pendingDriverId: string;
  let rideId: string;

  const now = Date.now();
  const adminEmail = `admin.e2e.${now}@test.local`;
  const adminPassword = 'AdminPass123!';
  const adminUsername = `admin_e2e_${now}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);

    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const admin = await prisma.user.create({
      data: {
        username: adminUsername,
        email: adminEmail,
        password: hashedPassword,
        firstName: 'Admin',
        lastName: 'E2E',
        phone: `+2217700${String(now).slice(-5)}`,
        role: 'ADMIN',
        roles: { set: ['ADMIN'] },
        isAdmin: true,
        verified: true,
        emailVerified: true,
        whatsappVerified: true,
      },
    });

    const normalUser = await prisma.user.create({
      data: {
        username: `user_e2e_${now}`,
        email: `user.e2e.${now}@test.local`,
        password: hashedPassword,
        firstName: 'User',
        lastName: 'E2E',
        phone: `+2217800${String(now).slice(-5)}`,
        role: 'PASSENGER',
        roles: { set: ['PASSENGER'] },
      },
    });
    createdUserId = normalUser.id;

    const pendingDriver = await prisma.user.create({
      data: {
        username: `driver_e2e_${now}`,
        email: `driver.e2e.${now}@test.local`,
        password: hashedPassword,
        firstName: 'Driver',
        lastName: 'Pending',
        phone: `+2217900${String(now).slice(-5)}`,
        role: 'DRIVER',
        roles: { set: ['DRIVER'] },
        driverLicenseVerified: false,
      },
    });
    pendingDriverId = pendingDriver.id;

    const ride = await prisma.ride.create({
      data: {
        driverId: pendingDriver.id,
        origin: 'Dakar',
        destination: 'Thiès',
        departureDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        departureTime: '10:00',
        pricePerSeat: 2500,
        availableSeats: 3,
        vehicleModel: 'Toyota',
        vehicleColor: 'White',
        vehiclePlate: `E2E-${String(now).slice(-4)}`,
        status: 'ACTIVE',
      },
    });
    rideId = ride.id;

    const loginRes = await request(app.getHttpServer()).post('/auth/login').send({
      email: admin.email,
      password: adminPassword,
    });

    adminToken = loginRes.body?.token;
  });

  afterAll(async () => {
    if (rideId) {
      await prisma.ride.deleteMany({ where: { id: rideId } });
    }

    if (pendingDriverId) {
      await prisma.user.deleteMany({ where: { id: pendingDriverId } });
    }

    if (createdUserId) {
      await prisma.user.deleteMany({ where: { id: createdUserId } });
    }

    await prisma.user.deleteMany({ where: { email: adminEmail } });

    await app.close();
  });

  it('login admin should return JWT token', async () => {
    expect(adminToken).toBeDefined();
    expect(typeof adminToken).toBe('string');
    expect(adminToken.length).toBeGreaterThan(20);
  });

  it('GET /users/admin/users should pass', async () => {
    await request(app.getHttpServer())
      .get('/users/admin/users?page=1&limit=10')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('GET /users/admin/drivers/pending should pass', async () => {
    await request(app.getHttpServer())
      .get('/users/admin/drivers/pending?page=1&limit=10')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('PUT /users/admin/users/:userId/roles should pass', async () => {
    await request(app.getHttpServer())
      .put(`/users/admin/users/${createdUserId}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roles: ['DRIVER', 'PASSENGER'] })
      .expect(200);
  });

  it('GET /rides/admin/rides/active should pass', async () => {
    await request(app.getHttpServer())
      .get('/rides/admin/rides/active?page=1&limit=10')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('GET /rides/admin/rides/:rideId/full should pass', async () => {
    await request(app.getHttpServer())
      .get(`/rides/admin/rides/${rideId}/full`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('DELETE /users/admin/users/:userId should pass', async () => {
    await request(app.getHttpServer())
      .delete(`/users/admin/users/${createdUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    createdUserId = '';
  });
});
