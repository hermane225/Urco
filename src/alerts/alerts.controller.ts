import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { CreateAlertDto } from './dto/alerts.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Request } from 'express';

@Controller('alerts')
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(private alertsService: AlertsService) {}

  @Post()
  async createAlert(@Req() req: Request, @Body() createAlertDto: CreateAlertDto) {
    const user = req.user as any;
    return this.alertsService.createAlert(user.id, createAlertDto);
  }

  @Get()
  async getUserAlerts(@Req() req: Request) {
    const user = req.user as any;
    return this.alertsService.getUserAlerts(user.id);
  }

  @Delete(':alertId')
  async deleteAlert(@Req() req: Request, @Param('alertId') alertId: string) {
    const user = req.user as any;
    return this.alertsService.deleteAlert(alertId, user.id);
  }

  @Get(':alertId/matches')
  async getMatchingRides(@Param('alertId') alertId: string) {
    return this.alertsService.checkMatchingRides(alertId);
  }
}

