import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { createHash } from 'crypto';

/**
 * Envoi SMS (Symtel) et email (SMTP) pour la billetterie.
 * Contrairement à l'OTP d'inscription, un échec d'envoi ne doit jamais faire
 * échouer une réservation ou un paiement : les erreurs sont journalisées et
 * la méthode renvoie false.
 */
@Injectable()
export class TicketingNotificationsService {
  private readonly logger = new Logger(TicketingNotificationsService.name);

  constructor(private configService: ConfigService) {}

  async sendSms(phone: string | null | undefined, content: string): Promise<boolean> {
    if (!phone) return false;

    const user = this.configService.get<string>('SYMTEL_USER');
    const password = this.configService.get<string>('SYMTEL_PASSWORD');
    const title = this.configService.get<string>('SYMTEL_TITLE') || 'URCO';

    if (!user || !password) {
      this.logger.warn('SYMTEL credentials are not configured, SMS not sent');
      return false;
    }

    const normalizedPhone = this.normalizePhone(phone);
    if (!normalizedPhone) {
      this.logger.warn(`Invalid phone number for SMS: ${phone}`);
      return false;
    }

    const md5Password = createHash('md5').update(password).digest('hex');
    const postUrl = 'https://www.symtel.biz/fr/index.php?mod=cgibin&page=2';
    const candidates = Array.from(new Set([normalizedPhone.replace(/^\+/, ''), normalizedPhone]));

    for (const phoneForProvider of candidates) {
      try {
        const response = await fetch(postUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            user,
            code: md5Password,
            title,
            phone: phoneForProvider,
            content,
          }).toString(),
        });
        const text = await response.text();
        if (response.ok && /<reponse\s+code=["']OK["']/i.test(text) && /\b0\s*:/i.test(text)) {
          return true;
        }
        this.logger.warn(`SYMTEL rejected SMS for ${phoneForProvider}: ${text.slice(0, 200)}`);
      } catch (error: any) {
        this.logger.error(`SYMTEL transport error for ${phoneForProvider}`, error?.stack || String(error));
      }
    }
    return false;
  }

  async sendEmail(to: string | null | undefined, subject: string, html: string): Promise<boolean> {
    if (!to) return false;

    const host = this.configService.get('SMTP_HOST');
    const port = this.configService.get('SMTP_PORT');
    const smtpUser = this.configService.get('SMTP_USER');
    const pass = this.configService.get('SMTP_PASS');
    const from = this.configService.get('SMTP_FROM') || 'URCO <noreply@urco.com>';

    if (!host || !port || !smtpUser || !pass) {
      this.logger.warn('SMTP credentials are not configured, email not sent');
      return false;
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port: parseInt(port, 10),
        secure: parseInt(port, 10) === 465,
        auth: { user: smtpUser, pass },
      });
      await transporter.sendMail({ from, to, subject, html });
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to send email to ${to}`, error?.stack || String(error));
      return false;
    }
  }

  private normalizePhone(input: string): string | null {
    const raw = (input || '').trim();
    if (raw.startsWith('+')) return raw;
    if (raw.startsWith('00')) return `+${raw.slice(2)}`;
    const digits = raw.replace(/\D/g, '');
    // Numérotation ivoirienne à 10 chiffres (depuis 2021) : le 0 initial est conservé.
    if (digits.length === 10) return `+225${digits}`;
    if (digits.length >= 8) return `+${digits}`;
    return null;
  }
}
