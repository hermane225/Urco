import { Body, Controller, ForbiddenException, Headers, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReservationsService } from '../reservations.service';
import { TICKET_PAYMENT_PROVIDER, TicketPaymentProvider } from '../payment-providers/payment-provider.interface';
import { SandboxPaymentProvider } from '../payment-providers/sandbox.provider';

@ApiTags('Billetterie - Paiements')
@Controller('ticketing/payments')
export class TicketPaymentsController {
  constructor(
    private reservations: ReservationsService,
    @Inject(TICKET_PAYMENT_PROVIDER) private provider: TicketPaymentProvider,
  ) {}

  /** Notification du fournisseur Mobile Money (public, revérifié côté fournisseur). */
  @Post('webhook/:provider')
  @HttpCode(200)
  webhook(@Param('provider') provider: string, @Body() body: any, @Headers() headers: Record<string, any>) {
    return this.reservations.handleWebhook(provider, body, headers);
  }

  /** Simule la validation du paiement sur le téléphone (sandbox uniquement). */
  @Post('sandbox/:reference/confirm')
  @HttpCode(200)
  async confirmSandbox(@Param('reference') reference: string) {
    if (!(this.provider instanceof SandboxPaymentProvider) || process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Disponible uniquement en mode sandbox');
    }
    const paymentId = await this.reservations.findPaymentIdByReference(reference);
    this.provider.markPaid(reference);
    await this.reservations.syncWithProvider(paymentId);
    return { confirmed: true };
  }
}
