import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma/prisma.service';
import { MessagesService } from './messages/messages.service';
import { RidesService } from './rides/rides.service';
import { UsersService } from './users/users.service';

describe('Hello World', () => {
	let prismaService: PrismaService;
	let messagesService: MessagesService;
	let ridesService: RidesService;
	let usersService: UsersService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [PrismaService, MessagesService, RidesService, UsersService],
		}).compile();

		prismaService = module.get<PrismaService>(PrismaService);
		messagesService = module.get<MessagesService>(MessagesService);
		ridesService = module.get<RidesService>(RidesService);
		usersService = module.get<UsersService>(UsersService);
	});

	it('should be defined', () => {
		expect(prismaService).toBeDefined();
		expect(messagesService).toBeDefined();
		expect(ridesService).toBeDefined();
		expect(usersService).toBeDefined();
	});
});