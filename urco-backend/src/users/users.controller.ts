import {
  Controller,
  BadRequestException,
  Get,
  Put,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { UsersService } from './users.service';
import { UpdateProfileDto, UploadDocumentDto, VerifyUserDto, RateDriverDto } from './dto/users.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Request } from 'express';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('profile')
  async getProfile(@Req() req: Request) {
    const user = req.user as any;
    return this.usersService.getProfile(user.id);
  }

  @Put('profile/edit')
  async updateProfile(@Req() req: Request, @Body() updateProfileDto: UpdateProfileDto) {
    const user = req.user as any;
    return this.usersService.updateProfile(user.id, updateProfileDto);
  }

  @Post('upload-document')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          cb(null, join(process.cwd(), 'uploads'));
        },
        filename: (req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async uploadDocument(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadDocumentDto,
  ) {
    const user = req.user as any;
    return this.usersService.uploadDocument(user.id, file, body.documentType);
  }

  @Get('photos')
  async getPhotos(@Req() req: Request) {
    const user = req.user as any;
    return this.usersService.getPhotos(user.id);
  }

  @Get('photos/:type')
  async getPhoto(@Req() req: Request, @Param('type') type: string) {
    const user = req.user as any;
    return this.usersService.getPhoto(user.id, type);
  }

  @Post('profile/enable-driver')
  async enableDriverMode(@Req() req: Request) {
    const user = req.user as any;
    return this.usersService.enableDriverMode(user.id);
  }

  @Post(':driverId/rate')
  async rateDriver(@Req() req: Request, @Param('driverId') driverId: string, @Body() dto: RateDriverDto) {
    const passenger = req.user as any;
    return this.usersService.rateDriver(driverId, passenger.id, dto);
  }

  @Get(':userId/avatar')
  async getUserAvatar(@Param('userId') userId: string) {
    return this.usersService.getUserAvatar(userId);
  }

  @Put(':userId/verify')
  async verifyUser(
    @Req() req: Request,
    @Param('userId') userId: string,
    @Body() dto: VerifyUserDto,
  ) {
    const currentUser = req.user as any;
    const hasAdminAccess =
      currentUser?.isAdmin ||
      currentUser?.role === 'ADMIN' ||
      (Array.isArray(currentUser?.roles) && currentUser.roles.includes('ADMIN'));

    if (!hasAdminAccess) {
      throw new BadRequestException('Admin access required');
    }
    return this.usersService.verifyUser(userId, dto);
  }
}
