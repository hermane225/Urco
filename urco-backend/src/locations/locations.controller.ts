import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { LocationsService } from './locations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Request } from 'express';
import { CreateLocationDto } from './dto/locations.dto';

@Controller('locations')
export class LocationsController {
  constructor(private locationsService: LocationsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async updateLiveLocation(@Req() req: Request, @Body() dto: CreateLocationDto) {
    const user = req.user as any;
    return this.locationsService.updateLiveLocation(user.id, dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyLocation(@Req() req: Request) {
    const user = req.user as any;
    return this.locationsService.getLiveLocation(user.id);
  }

  @Get()
  async getAllActiveLocations() {
    return this.locationsService.getAllActiveLiveLocations();
  }
}

