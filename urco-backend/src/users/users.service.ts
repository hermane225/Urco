import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto, VerifyUserDto } from './dto/users.dto';
import { ListUsersQuery, UpdateUserRolesDto } from './dto/admin-users.dto';
import { Prisma, UserRole } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.sanitizeUser(user);
  }

  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const { dateOfBirth, ...rest } = updateProfileDto;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...rest,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      },
    });

    return this.sanitizeUser(user);
  }

  async uploadDocument(userId: string, file: Express.Multer.File, documentType: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Save file path to database
    const filePath = `/uploads/${file.filename}`;

    const updateData: any = {};

    switch (documentType) {
      case 'avatar':
        updateData.avatar = filePath;
        break;
      case 'selfie':
        updateData.selfiePhoto = filePath;
        break;
      case 'idDocument':
        updateData.idDocumentPhoto = filePath;
        break;
      case 'driverLicense':
        updateData.driverLicense = filePath;
        break;
      case 'carInsurance':
        updateData.carInsurance = filePath;
        break;
      default:
        throw new BadRequestException('Invalid document type');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return this.sanitizeUser(updatedUser);
  }

  async getPhotos(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      avatar: user.avatar,
      selfiePhoto: user.selfiePhoto,
      idDocumentPhoto: user.idDocumentPhoto,
      driverLicense: user.driverLicense,
      carInsurance: user.carInsurance,
    };
  }

  async getPhoto(userId: string, type: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    let photoPath: string | null = null;

    switch (type) {
      case 'avatar':
        photoPath = user.avatar;
        break;
      case 'selfie':
        photoPath = user.selfiePhoto;
        break;
      case 'idDocument':
        photoPath = user.idDocumentPhoto;
        break;
      case 'driverLicense':
        photoPath = user.driverLicense;
        break;
      case 'carInsurance':
        photoPath = user.carInsurance;
        break;
      default:
        throw new BadRequestException('Invalid photo type');
    }

    if (!photoPath) {
      throw new NotFoundException('Photo not found');
    }

    return { path: photoPath };
  }

  async getUserAvatar(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.avatar) {
      throw new NotFoundException('Avatar not found');
    }

    return { path: user.avatar };
  }

  async verifyUser(userId: string, dto: VerifyUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updateData: any = {
      verified: dto.verified ?? true,
    };

    if (dto.idDocumentVerified !== undefined) {
      updateData.idDocumentVerified = dto.idDocumentVerified;
    }
    if (dto.driverLicenseVerified !== undefined) {
      updateData.driverLicenseVerified = dto.driverLicenseVerified;
    }
    if (dto.carInsuranceVerified !== undefined) {
      updateData.carInsuranceVerified = dto.carInsuranceVerified;
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return this.sanitizeUser(updatedUser);
  }

  async enableDriverMode(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, roles: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const nextRoles = new Set(user.roles || []);
    nextRoles.add(UserRole.PASSENGER);
    nextRoles.add(UserRole.DRIVER);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        role: UserRole.DRIVER,
        roles: { set: Array.from(nextRoles) },
      },
    });

    return {
      message: 'Mode chauffeur active sur ce compte',
      user: this.sanitizeUser(updated),
    };
  }

  private sanitizeUser(user: any) {
    const { password, emailCode, emailCodeExpiry, whatsappCode, whatsappCodeExpiry, ...result } = user;
    return result;
  }
}

