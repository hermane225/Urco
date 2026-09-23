import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  InitiatePaymentInput,
  InitiatePaymentResult,
  TicketPaymentProvider,
  VerifyPaymentResult,
} from './payment-provider.interface';

/**
 * Fournisseur de test : simule un paiement Mobile Money.
 * - TICKETING_SANDBOX_AUTO_CONFIRM=true : paiement accepté immédiatement.
 * - sinon : paiement en attente, confirmé via POST /ticketing/payments/sandbox/:reference/confirm.
 * Les numéros se terminant par 0000 sont refusés, pour tester les échecs.
 * Ne jamais utiliser en production.
 */
@Injectable()
export class SandboxPaymentProvider implements TicketPaymentProvider {
  readonly name = 'sandbox';
  private readonly confirmed = new Map<string, 'PAID' | 'FAILED'>();

  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const providerReference = `SBX-${randomUUID()}`;
    if (input.payerPhone.replace(/\D/g, '').endsWith('0000')) {
      this.confirmed.set(providerReference, 'FAILED');
      return { providerReference, status: 'FAILED', instructions: 'Paiement refusé (sandbox)' };
    }
    if (process.env.TICKETING_SANDBOX_AUTO_CONFIRM === 'true') {
      this.confirmed.set(providerReference, 'PAID');
      return { providerReference, status: 'PAID' };
    }
    return {
      providerReference,
      status: 'PENDING',
      instructions: 'Sandbox : confirmez le paiement via /ticketing/payments/sandbox/:reference/confirm',
    };
  }

  async verify(providerReference: string): Promise<VerifyPaymentResult> {
    return { status: this.confirmed.get(providerReference) ?? 'PENDING' };
  }

  extractReference(body: any): string | null {
    return typeof body?.reference === 'string' ? body.reference : null;
  }

  /** Utilisé par l'endpoint de confirmation sandbox */
  markPaid(providerReference: string) {
    this.confirmed.set(providerReference, 'PAID');
  }
}
