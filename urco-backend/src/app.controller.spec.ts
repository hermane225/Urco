import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return API info object', () => {
      expect(appController.getApiInfo()).toMatchObject({
        status: 'ok',
        name: 'Urco API',
        version: '1.0',
        docs: '/api/docs',
      });
    });
  });

  describe('health', () => {
    it('should return health status', () => {
      expect(appController.getHealth()).toHaveProperty('status', 'ok');
      expect(appController.getHealth()).toHaveProperty('timestamp');
    });
  });
});
