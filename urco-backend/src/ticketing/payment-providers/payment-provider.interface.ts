import { TicketPaymentMethod } from '@prisma/client';

export type ProviderPaymentStatus = 'PENDING' | 'PAID' | 'FAILED';

export interface InitiatePaymentInput {
  paymentId: string;
  amount: number;
  currency: string;
  method: TicketPaymentMethod;
  payerPhone: string;
  description: string;
}

export interface InitiatePaymentResult {
  providerReference: string;
  status: ProviderPaymentStatus;
  /** URL de paiement à ouvrir côté app, si le fournisseur en fournit une */
  paymentUrl?: string;
  /** Instructions à afficher (ex. « Validez la demande sur votre téléphone ») */
  instructions?: string;
  raw?: any;
}

export interface VerifyPaymentResult {
  status: ProviderPaymentStatus;
  raw?: any;
}

/**
 * Contrat d'un agrégateur Mobile Money (Orange, MTN, Moov, Wave…).
 * Le statut n'est jamais déduit du corps d'un webhook : on revérifie toujours
 * auprès du fournisseur via `verify` (anti-fraude).
 */
export interface TicketPaymentProvider {
  readonly name: string;
  initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  verify(providerReference: string): Promise<VerifyPaymentResult>;
  /** Extrait la référence de paiement d'un webhook entrant */
  extractReference(body: any, headers: Record<string, any>): string | null;
}

export const TICKET_PAYMENT_PROVIDER = Symbol('TICKET_PAYMENT_PROVIDER');
