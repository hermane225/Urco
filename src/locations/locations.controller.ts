import {
  Controller,
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
@UseGuards(JwtAuthGuard)
export class LocationsController {
  constructor(private locationsService: LocationsService) {}

  @Post()
  async updateLocation(@Req() req: Request, @Body() dto: CreateLocationDto) {
    const user = req.user as any;
    return this.locationsService.updateLiveLocation(user.id, dto);
  }
}
