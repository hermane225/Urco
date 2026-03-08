import { Controller, Post, Body, Get, UseGuards, Res, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { SignupDto, LoginDto, SendCodeDto, VerifyCodeDto, SendWhatsAppCodeDto, VerifyWhatsAppCodeDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  async signup(@Body() signupDto: SignupDto) {
    return this.authService.signup(signupDto);
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Res() res: Response) {
    res.status(200).json({ message: 'Logged out successfully' });
  }

  @Post('send-code')
  async sendCode(@Body() sendCodeDto: SendCodeDto) {
    return this.authService.resendVerificationCode(sendCodeDto.email);
  }

  @Post('verify-code')
  async verifyCode(@Body() verifyCodeDto: VerifyCodeDto) {
    return this.authService.verifyEmailCode(verifyCodeDto.email, verifyCodeDto.code);
  }

  @Post('verify-phone/send')
  @UseGuards(JwtAuthGuard)
  async sendWhatsAppCode(@Body() sendWhatsAppCodeDto: SendWhatsAppCodeDto) {
    return this.authService.sendWhatsAppCode(sendWhatsAppCodeDto.phone);
  }

  @Post('verify-phone/confirm')
  @UseGuards(JwtAuthGuard)
  async verifyWhatsAppCode(@Body() verifyWhatsAppCodeDto: VerifyWhatsAppCodeDto) {
    return this.authService.verifyWhatsAppCode(verifyWhatsAppCodeDto.phone, verifyWhatsAppCodeDto.code);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: Request) {
    const user = req.user as any;
    return this.authService.getProfile(user.id);
  }
}

