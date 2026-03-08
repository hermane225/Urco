import {
  Controller,
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
import { extname } from 'path';
import { UsersService } from './users.service';
import { UpdateProfileDto, UploadDocumentDto } from './dto/users.dto';
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
        destination: './uploads',
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

  @Get(':userId/avatar')
  async getUserAvatar(@Param('userId') userId: string) {
    return this.usersService.getUserAvatar(userId);
  }
}

