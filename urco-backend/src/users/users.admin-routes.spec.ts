import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
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

describe('Users Admin Routes', () => {
  let app: INestApplication;
  const usersServiceMock = {
    listUsers: jest.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } }),
    deleteUser: jest.fn().mockResolvedValue({ message: 'deleted' }),
    updateUserRoles: jest.fn().mockResolvedValue({ id: 'u1', roles: ['DRIVER'] }),
    getPendingDrivers: jest.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersServiceMock }],
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

  it('GET /users/admin/users should pass for admin', async () => {
    await request(app.getHttpServer()).get('/users/admin/users').set('x-admin', 'true').expect(200);
    expect(usersServiceMock.listUsers).toHaveBeenCalled();
  });

  it('GET /users/admin/users should fail for non-admin', async () => {
    await request(app.getHttpServer()).get('/users/admin/users').expect(400);
  });

  it('DELETE /users/admin/users/:userId should pass for admin', async () => {
    await request(app.getHttpServer()).delete('/users/admin/users/u1').set('x-admin', 'true').expect(200);
    expect(usersServiceMock.deleteUser).toHaveBeenCalledWith('u1');
  });

  it('PUT /users/admin/users/:userId/roles should pass for admin', async () => {
    await request(app.getHttpServer())
      .put('/users/admin/users/u1/roles')
      .set('x-admin', 'true')
      .send({ roles: ['DRIVER'] })
      .expect(200);
    expect(usersServiceMock.updateUserRoles).toHaveBeenCalledWith('u1', { roles: ['DRIVER'] });
  });

  it('GET /users/admin/drivers/pending should pass for admin', async () => {
    await request(app.getHttpServer())
      .get('/users/admin/drivers/pending?page=1&limit=20')
      .set('x-admin', 'true')
      .expect(200);
    expect(usersServiceMock.getPendingDrivers).toHaveBeenCalledWith(1, 20);
  });
});
