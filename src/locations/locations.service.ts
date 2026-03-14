import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto } from './dto/locations.dto';

@Injectable()
export class LocationsService {
  constructor(private prisma: PrismaService) {}

  async updateLiveLocation(userId: string, dto: CreateLocationDto) {
    const { lat, lng, bookingId } = dto;

    // Find existing or create new live location for user
    let location = await this.prisma.liveLocation.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' }
    });

    if (location) {
      location = await this.prisma.liveLocation.update({
        where: { id: location.id },
        data: {
          lat,
          lng,
          bookingId,
        },
      });
    } else {
      location = await this.prisma.liveLocation.create({
        data: {
          userId,
          lat,
          lng,
          bookingId,
        },
      });
    }

    return location;
  }

  async getLiveLocation(userId: string) {
    return this.prisma.liveLocation.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' }
    });
  }

  async getAllActiveLiveLocations() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return this.prisma.liveLocation.findMany({
      where: {
        updatedAt: {
          gt: oneHourAgo
        }
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            rating: true
          }
        }
      }
    });
  }
}
