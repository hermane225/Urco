import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  BadGatewayException,
  Logger,
  HttpException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as nodemailer from 'nodemailer';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SignupDto, LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async signup(signupDto: SignupDto, file?: Express.Multer.File) {
    try {
      const {
        email,
        username,
        password,
        firstName,
        lastName,
        phone,
        gender,
        dateOfBirth,
        role,
      } = signupDto;
      const userRole = role || 'PASSENGER';
      const isAdminUser = String(userRole) === 'ADMIN';
      const avatarPath = file ? `/uploads/${file.filename}` : null;

      if (!phone) {
        throw new BadRequestException('Phone number is required for registration');
      }

      // Check if user exists
      const existingUser = await this.prisma.user.findFirst({
        where: {
          OR: [{ email }, { username }, { phone }],
        },
      });

      if (existingUser) {
        throw new BadRequestException('Email, username or phone already exists');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Check if phone was previously verified through pending OTP verification
      const pendingVerification = await this.prisma.pendingEmailVerification.findUnique({
        where: { email: phone },
      });

      if (
        !pendingVerification ||
        !pendingVerification.verified ||
        pendingVerification.expiresAt < new Date()
      ) {
        throw new BadRequestException('Phone number not verified. Please verify OTP before signup.');
      }

      // Create user
      const user = await this.prisma.user.create({
        data: {
          username,
          email,
          password: hashedPassword,
          firstName,
          lastName,
          phone,
          gender,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          role: userRole,
          roles: {
            set: [userRole],
          },
          isAdmin: isAdminUser,
          avatar: avatarPath,
          whatsappVerified: true,
          emailVerified: true,
          verified: true,
        },
      });

      // Clean up pending phone verification record used during signup OTP flow
      await this.prisma.pendingEmailVerification.deleteMany({
        where: { email: phone },
      });

      // Generate token
      const token = this.generateToken(user.id, user.email);

      return {
        user: this.sanitizeUser(user),
        token,
        phoneWasPreVerified: true,
      };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('Signup failed', error?.stack || String(error));

      if (error?.code === 'P2002') {
        throw new BadRequestException('Email, username or phone already exists');
      }

      if (error?.code === 'P2021' || error?.code === 'P2022') {
        throw new BadRequestException(
          'Signup storage is not fully initialized on server. Run Prisma schema sync.',
        );
      }

      throw new BadRequestException('Unable to create account at the moment');
    }
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.generateToken(user.id, user.email);

    return {
      user: this.sanitizeUser(user),
      token,
    };
  }

  async sendVerificationEmail(email: string, code: string) {
    try {
      // Get SMTP configuration from environment variables
      const smtpHost = this.configService.get('SMTP_HOST');
      const smtpPort = this.configService.get('SMTP_PORT');
      const smtpUser = this.configService.get('SMTP_USER');
      const smtpPass = this.configService.get('SMTP_PASS');
      const smtpFrom = this.configService.get('SMTP_FROM') || 'URCO <noreply@urco.com>';

      if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
        console.error('SMTP credentials not configured');
        return;
      }

      // Create transporter
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort, 10),
        secure: parseInt(smtpPort, 10) === 465, // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      // Send email
      await transporter.sendMail({
        from: smtpFrom,
        to: email,
        subject: 'URCO - Email Verification Code',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">URCO Email Verification</h2>
            <p>Your verification code is:</p>
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 5px; margin: 20px 0;">
              ${code}
            </div>
            <p style="color: #666; font-size: 14px;">This code will expire in 15 minutes.</p>
            <p style="color: #999; font-size: 12px;">If you didn't request this code, please ignore this email.</p>
          </div>
        `,
      });

      console.log(`Verification email sent to ${email}`);
    } catch (error) {
      console.error('Failed to send verification email:', error);
    }
  }

  async verifyPhoneCode(phone: string, code: string) {
    const user = await this.prisma.user.findFirst({
      where: { phone },
    });

    if (user) {
      if (user.whatsappCode !== code) {
        throw new BadRequestException('Invalid verification code');
      }

      if (user.whatsappCodeExpiry && user.whatsappCodeExpiry < new Date()) {
        throw new BadRequestException('Verification code expired');
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          whatsappVerified: true,
          whatsappCode: null,
          whatsappCodeExpiry: null,
          verified: true,
        },
      });

      return { message: 'Phone verified successfully', verified: true };
    }

    const pendingVerification = await this.prisma.pendingEmailVerification.findUnique({
      where: { email: phone },
    });

    if (!pendingVerification) {
      throw new BadRequestException('No verification code found for this phone number. Please request a new code.');
    }

    if (pendingVerification.code !== code) {
      throw new BadRequestException('Invalid verification code');
    }

    if (pendingVerification.expiresAt < new Date()) {
      throw new BadRequestException('Verification code expired');
    }

    await this.prisma.pendingEmailVerification.update({
      where: { email: phone },
      data: {
        verified: true,
      },
    });

    return {
      message: 'Phone verified successfully',
      verified: true,
      pending: true,
      canContinue: true,
    };
  }

  async resendVerificationCode(phone: string) {
    try {
      const user = await this.prisma.user.findFirst({
        where: { phone },
      });

      const otp = this.generateOtpCode();
      const expiry = new Date(Date.now() + 15 * 60 * 1000);

      if (user) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            whatsappCode: otp,
            whatsappCodeExpiry: expiry,
          },
        });
      } else {
        await this.prisma.pendingEmailVerification.upsert({
          where: { email: phone },
          update: {
            code: otp,
            verified: false,
            expiresAt: expiry,
          },
          create: {
            email: phone,
            code: otp,
            verified: false,
            expiresAt: expiry,
          },
        });
      }

      await this.sendSmsOtp(phone, `URCO: votre code de verification est ${otp}. Expire dans 15 minutes.`);

      return { message: 'Verification code sent by SMS', pending: !user };
    } catch (error: any) {
      this.logger.error('Failed to resend verification code', error?.stack || String(error));

      if (error instanceof HttpException) {
        throw error;
      }

      // Prisma: table/column missing in production schema (migration not applied)
      if (error?.code === 'P2021' || error?.code === 'P2022') {
        throw new BadRequestException(
          'OTP storage table is missing on server. Run Prisma migrations on production database.',
        );
      }

      throw new BadRequestException('Unable to send verification code at the moment');
    }
  }

  async sendWhatsAppCode(phone: string) {
    const user = await this.prisma.user.findFirst({
      where: { phone },
    });

    if (!user) {
      throw new BadRequestException('User not found with this phone number');
    }

    const whatsappCode = Math.floor(100000 + Math.random() * 900000).toString();
    const whatsappCodeExpiry = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        whatsappCode,
        whatsappCodeExpiry,
      },
    });

    await this.sendSmsOtp(phone, `URCO: votre code OTP est ${whatsappCode}. Expire dans 15 minutes.`);

    return { message: 'OTP code sent by SMS' };
  }

  async requestPasswordResetOtp(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('User not found with this email');
    }

    const otp = this.generateOtpCode();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailCode: otp,
        emailCodeExpiry: expiry,
      },
    });

    await this.sendPasswordResetEmail(email, otp);

    return { message: 'Password reset OTP sent by email' };
  }

  async resetPasswordWithOtp(email: string, code: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('User not found with this email');
    }

    if (user.emailCode !== code) {
      throw new BadRequestException('Invalid OTP code');
    }

    if (user.emailCodeExpiry && user.emailCodeExpiry < new Date()) {
      throw new BadRequestException('OTP code expired');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        emailCode: null,
        emailCodeExpiry: null,
      },
    });

    return { message: 'Password reset successfully' };
  }

  async verifyWhatsAppCode(phone: string, code: string) {
    const user = await this.prisma.user.findFirst({
      where: { phone },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.whatsappVerified) {
      throw new BadRequestException('WhatsApp already verified');
    }

    if (user.whatsappCode !== code) {
      throw new BadRequestException('Invalid verification code');
    }

    if (user.whatsappCodeExpiry && user.whatsappCodeExpiry < new Date()) {
      throw new BadRequestException('Verification code expired');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        whatsappVerified: true,
        whatsappCode: null,
        whatsappCodeExpiry: null,
        verified: true,
      },
    });

    return { message: 'WhatsApp verified successfully' };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return this.sanitizeUser(user);
  }

  private generateToken(userId: string, email: string): string {
    return this.jwtService.sign({ sub: userId, email });
  }

  private generateOtpCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private normalizePhoneForSms(inputPhone: string): string {
    const raw = (inputPhone || '').trim();

    if (!raw) {
      throw new BadRequestException('Phone number is required');
    }

    if (raw.startsWith('+')) {
      return raw;
    }

    if (raw.startsWith('00')) {
      return `+${raw.slice(2)}`;
    }

    const digits = raw.replace(/\D/g, '');

    // Accept local Ivory Coast format (10 digits starting by 0) and convert to international.
    if (digits.length === 10 && digits.startsWith('0')) {
      return `+225${digits.slice(1)}`;
    }

    if (digits.length >= 8) {
      return `+${digits}`;
    }

    throw new BadRequestException('Invalid phone number format');
  }

  private isSymtelBusinessSuccess(responseText: string): boolean {
    const hasOkCode = /<reponse\s+code=["']OK["']/i.test(responseText);
    const hasSuccessPrefix = /\b0\s*:/i.test(responseText);
    return hasOkCode && hasSuccessPrefix;
  }

  private truncateProviderResponse(responseText: string, max = 350): string {
    const compact = responseText.replace(/\s+/g, ' ').trim();
    return compact.length > max ? `${compact.slice(0, max)}...` : compact;
  }

  private async sendSmsOtp(phone: string, content: string) {
    const user = this.configService.get<string>('SYMTEL_USER');
    const password = this.configService.get<string>('SYMTEL_PASSWORD');
    const title = this.configService.get<string>('SYMTEL_TITLE') || 'URCO';

    if (!user || !password) {
      this.logger.error('SYMTEL credentials are not configured');
      throw new BadRequestException('SMS provider is not configured');
    }

    const normalizedPhone = this.normalizePhoneForSms(phone);
    const phoneCandidates = Array.from(
      new Set([normalizedPhone.replace(/^\+/, ''), normalizedPhone]),
    );

    const md5Password = createHash('md5').update(password).digest('hex');
    const postUrl = 'https://www.symtel.biz/fr/index.php?mod=cgibin&page=2';

    try {
      for (const phoneForProvider of phoneCandidates) {
        const payload = {
          user,
          code: md5Password,
          title,
          phone: phoneForProvider,
          content,
        };

        const postBody = new URLSearchParams(payload);
        const postResponse = await fetch(postUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: postBody.toString(),
        });
        const postText = await postResponse.text();

        if (!postResponse.ok) {
          this.logger.warn(
            `SYMTEL POST HTTP ${postResponse.status} for ${phoneForProvider}. Response: ${this.truncateProviderResponse(postText)}`,
          );
          continue;
        }

        if (this.isSymtelBusinessSuccess(postText)) {
          this.logger.log(
            `SYMTEL accepted SMS for ${phoneForProvider}. Response: ${this.truncateProviderResponse(postText)}`,
          );
          return;
        }

        this.logger.warn(
          `SYMTEL POST non-success business response for ${phoneForProvider}: ${this.truncateProviderResponse(postText)}`,
        );
      }

      throw new BadRequestException('SMS provider rejected message');
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        `SYMTEL transport error while sending OTP to ${normalizedPhone}`,
        error?.stack || String(error),
      );
      throw new BadGatewayException('SMS gateway is unreachable from server');
    }
  }

  private async sendPasswordResetEmail(email: string, code: string) {
    try {
      const smtpHost = this.configService.get('SMTP_HOST');
      const smtpPort = this.configService.get('SMTP_PORT');
      const smtpUser = this.configService.get('SMTP_USER');
      const smtpPass = this.configService.get('SMTP_PASS');
      const smtpFrom = this.configService.get('SMTP_FROM') || 'URCO <noreply@urco.com>';

      if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
        this.logger.error('SMTP credentials not configured');
        throw new BadRequestException('Email provider is not configured');
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort, 10),
        secure: parseInt(smtpPort, 10) === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      await transporter.sendMail({
        from: smtpFrom,
        to: email,
        subject: 'URCO - Code de reinitialisation du mot de passe',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">URCO - Mot de passe oublie</h2>
            <p>Votre code OTP est :</p>
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 5px; margin: 20px 0;">
              ${code}
            </div>
            <p style="color: #666; font-size: 14px;">Ce code expire dans 15 minutes.</p>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error('Failed to send password reset email', error as any);
      throw new BadRequestException('Unable to send reset OTP by email');
    }
  }

  private sanitizeUser(user: any) {
    const { password, emailCode, emailCodeExpiry, whatsappCode, whatsappCodeExpiry, ...result } = user;
    return result;
  }
}

