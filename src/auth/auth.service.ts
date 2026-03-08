import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { SignupDto, LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async signup(signupDto: SignupDto) {
    const { email, username, password, firstName, lastName, phone, gender, dateOfBirth, role } = signupDto;

    // Check if user exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      throw new BadRequestException('Email or username already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate email verification code
    const emailCode = Math.floor(100000 + Math.random() * 900000).toString();
    const emailCodeExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

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
        role: role || 'PASSENGER',
        emailCode,
        emailCodeExpiry,
      },
    });

    // Send verification email
    await this.sendVerificationEmail(email, emailCode);

    // Generate token
    const token = this.generateToken(user.id, user.email);

    return {
      user: this.sanitizeUser(user),
      token,
    };
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

  async verifyEmailCode(email: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email already verified');
    }

    if (user.emailCode !== code) {
      throw new BadRequestException('Invalid verification code');
    }

    if (user.emailCodeExpiry && user.emailCodeExpiry < new Date()) {
      throw new BadRequestException('Verification code expired');
    }

    await this.prisma.user.update({
      where: { email },
      data: {
        emailVerified: true,
        emailCode: null,
        emailCodeExpiry: null,
        verified: true,
      },
    });

    return { message: 'Email verified successfully' };
  }

  async resendVerificationCode(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email already verified');
    }

    const emailCode = Math.floor(100000 + Math.random() * 900000).toString();
    const emailCodeExpiry = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.user.update({
      where: { email },
      data: {
        emailCode,
        emailCodeExpiry,
      },
    });

    await this.sendVerificationEmail(email, emailCode);

    return { message: 'Verification code sent' };
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

    // In production, integrate with WhatsApp API (Twilio, etc.)
    console.log(`WhatsApp verification code for ${phone}: ${whatsappCode}`);

    return { message: 'WhatsApp code sent' };
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

  private sanitizeUser(user: any) {
    const { password, emailCode, emailCodeExpiry, whatsappCode, whatsappCodeExpiry, ...result } = user;
    return result;
  }
}

