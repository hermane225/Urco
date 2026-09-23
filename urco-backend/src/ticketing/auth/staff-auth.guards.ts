import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { STAFF_JWT_STRATEGY, StaffPrincipal, StaffType } from './staff-jwt.strategy';

function staffGuard(type: StaffType, message: string) {
  @Injectable()
  class Guard extends AuthGuard(STAFF_JWT_STRATEGY) {
    handleRequest(err: any, user: any, info: any, context: any, status?: any) {
      const principal = super.handleRequest(err, user, info, context, status) as StaffPrincipal;
      if (principal.type !== type) {
        throw new ForbiddenException(message);
      }
      return principal as any;
    }
  }
  return Guard;
}

export const StationAgentGuard = staffGuard('station', 'Réservé aux agents de gare');
export const InspectorGuard = staffGuard('inspector', 'Réservé aux contrôleurs');
