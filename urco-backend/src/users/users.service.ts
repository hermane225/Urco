import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RateDriverDto, UpdateProfileDto, VerifyUserDto } from './dto/users.dto';
import { ListUsersQuery, UpdateUserRolesDto } from './dto/admin-users.dto';
import { Prisma, UserRole } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { AlertsService } from '../alerts/alerts.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private alertsService: AlertsService,
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
      avatarUrl: this.toPublicFileUrl(user.avatar),
      selfiePhoto: user.selfiePhoto,
      selfiePhotoUrl: this.toPublicFileUrl(user.selfiePhoto),
      idDocumentPhoto: user.idDocumentPhoto,
      idDocumentPhotoUrl: this.toPublicFileUrl(user.idDocumentPhoto),
      driverLicense: user.driverLicense,
      driverLicenseUrl: this.toPublicFileUrl(user.driverLicense),
      carInsurance: user.carInsurance,
      carInsuranceUrl: this.toPublicFileUrl(user.carInsurance),
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

    return {
      path: photoPath,
      url: this.toPublicFileUrl(photoPath),
    };
  }

  async getUserAvatar(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.avatar) {
      throw new NotFoundException('Avatar not found');
    }

    return {
      path: user.avatar,
      url: this.toPublicFileUrl(user.avatar),
    };
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

    const docsReviewed =
      dto.idDocumentVerified !== undefined ||
      dto.driverLicenseVerified !== undefined ||
      dto.carInsuranceVerified !== undefined;

    if (docsReviewed) {
      const docsApproved =
        updatedUser.idDocumentVerified &&
        updatedUser.driverLicenseVerified &&
        updatedUser.carInsuranceVerified;

      await this.alertsService.notifyDriverDocumentsReviewResult({
        userId: updatedUser.id,
        approved: !!docsApproved,
        details: docsApproved
          ? undefined
          : 'Certains documents conducteur n\'ont pas ete valides. Merci de les mettre a jour puis re-soumettre.',
      });
    }

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

  async rateDriver(driverId: string, passengerId: string, dto: RateDriverDto) {
    // Vérifier booking complété pour ce passager/ride
    const booking = await this.prisma.booking.findFirst({
      where: {
        rideId: dto.rideId,
        passengerId,
        status: 'COMPLETED'
      }
    });

    if (!booking) {
      throw new BadRequestException('Aucun booking complété trouvé pour ce trajet');
    }

    // Vérifier pas de notation existante
    const existingRating = await this.prisma.rideEvent.findFirst({
      where: {
        rideId: dto.rideId,
        type: 'RATING',
        userId: passengerId
      }
    });

    if (existingRating) {
      throw new BadRequestException('Trajet déjà noté');
    }

    // Enregistrer événement notation
    await this.prisma.rideEvent.create({
      data: {
        rideId: dto.rideId,
        type: 'RATING',
        userId: passengerId,
        data: { rating: dto.rating },
        description: `Notation ${dto.rating}/5`
      }
    });

    // Mettre à jour moyenne du chauffeur
    const driver = await this.prisma.user.findUnique({
      where: { id: driverId },
      select: { rating: true, ridesCompleted: true }
    });

    if (!driver) {
      throw new NotFoundException('Chauffeur non trouvé');
    }

    const newRidesCompleted = driver.ridesCompleted + 1;
    const newRating = (driver.rating * driver.ridesCompleted + dto.rating) / newRidesCompleted;

    await this.prisma.user.update({
      where: { id: driverId },
      data: {
        rating: newRating,
        ridesCompleted: newRidesCompleted
      }
    });

    return {
      message: 'Chauffeur noté avec succès',
      newRating,
      ridesCompleted: newRidesCompleted
    };
  }

  private sanitizeUser(user: any) {
    const { password, emailCode, emailCodeExpiry, whatsappCode, whatsappCodeExpiry, ...result } = user;
    return {
      ...result,
      avatarUrl: this.toPublicFileUrl(result.avatar),
      selfiePhotoUrl: this.toPublicFileUrl(result.selfiePhoto),
      idDocumentPhotoUrl: this.toPublicFileUrl(result.idDocumentPhoto),
      driverLicenseUrl: this.toPublicFileUrl(result.driverLicense),
      carInsuranceUrl: this.toPublicFileUrl(result.carInsurance),
    };
  }

  // ============== ADMIN METHODS ==============

  async listUsers(query: ListUsersQuery) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.role) {
      where.roles = {
        has: query.role,
      };
    }

    if (query.pendingValidation !== undefined) {
      if (query.pendingValidation) {
        where.OR = [
          { idDocumentVerified: false },
          { driverLicenseVerified: false },
          { carInsuranceVerified: false },
        ];
      }
    }

    if (query.search) {
      where.OR = [
        { username: { contains: query.search, mode: 'insensitive' } },
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          avatar: true,
          roles: true,
          verified: true,
          idDocumentVerified: true,
          driverLicenseVerified: true,
          carInsuranceVerified: true,
          rating: true,
          ridesCompleted: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    const sanitizedUsers = users.map((user) => ({
      ...user,
      avatarUrl: this.toPublicFileUrl(user.avatar),
    }));

    return {
      data: sanitizedUsers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async deleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Supprimer les booking de l'utilisateur
    await this.prisma.booking.deleteMany({
      where: {
        OR: [{ passengerId: userId }, { ride: { driverId: userId } }],
      },
    });

    // Supprimer les rides de l'utilisateur complètement
    const ridesDeleted = await this.prisma.rideEvent.deleteMany({
      where: { ride: { driverId: userId } },
    });

    const ridesDeleted2 = await this.prisma.ride.deleteMany({
      where: { driverId: userId },
    });

    // Enfin, supprimer l'utilisateur
    const deletedUser = await this.prisma.user.delete({
      where: { id: userId },
    });

    return {
      message: 'User deleted successfully',
      deletedUser: this.sanitizeUser(deletedUser),
    };
  }

  async updateUserRoles(userId: string, dto: UpdateUserRolesDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // S'assurer que les rôles fournis sont valides
    const validRoles = Object.values(UserRole);
    for (const role of dto.roles) {
      if (!validRoles.includes(role)) {
        throw new BadRequestException(`Invalid role: ${role}`);
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        roles: {
          set: dto.roles,
        },
        role: dto.roles[0] || UserRole.PASSENGER,
      },
    });

    return this.sanitizeUser(updatedUser);
  }

  async getPendingDrivers(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const where = {
      roles: {
        has: UserRole.DRIVER,
      },
      driverLicenseVerified: false,
    };

    const [drivers, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          avatar: true,
          driverLicense: true,
          carInsurance: true,
          idDocumentPhoto: true,
          idDocumentVerified: true,
          driverLicenseVerified: true,
          carInsuranceVerified: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    const sanitizedDrivers = drivers.map((driver) => ({
      ...driver,
      avatarUrl: this.toPublicFileUrl(driver.avatar),
      driverLicenseUrl: this.toPublicFileUrl(driver.driverLicense),
      carInsuranceUrl: this.toPublicFileUrl(driver.carInsurance),
      idDocumentPhotoUrl: this.toPublicFileUrl(driver.idDocumentPhoto),
    }));

    return {
      data: sanitizedDrivers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  private toPublicFileUrl(filePath?: string | null) {
    if (!filePath) {
      return null;
    }

    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }

    const baseUrl =
      this.configService.get<string>('PUBLIC_BASE_URL') ||
      `http://localhost:${this.configService.get<string>('PORT') || '3002'}`;

    return `${baseUrl}${filePath.startsWith('/') ? filePath : `/${filePath}`}`;
  }
}

