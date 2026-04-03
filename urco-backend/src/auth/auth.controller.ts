import { Controller, Post, Body, Get, UseGuards, Res, Req, UseInterceptors, UploadedFile } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service';
import {
  SignupDto,
  LoginDto,
  SendCodeDto,
  VerifyCodeDto,
  SendWhatsAppCodeDto,
  VerifyWhatsAppCodeDto,
  ForgotPasswordRequestDto,
  ForgotPasswordResetDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          cb(null, join(process.cwd(), 'uploads'));
        },
        filename: (req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async signup(
    @Body() signupDto: SignupDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.authService.signup(signupDto, file);
  }

  @Post('login')
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({ status: 200, description: 'User logged in successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'User logout' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(@Res() res: Response) {
    res.status(200).json({ message: 'Logged out successfully' });
  }

  @Post('send-code')
  @ApiOperation({ summary: 'Send SMS verification code' })
  @ApiResponse({ status: 200, description: 'Verification code sent' })
  async sendCode(@Body() sendCodeDto: SendCodeDto) {
    return this.authService.resendVerificationCode(sendCodeDto.phone);
  }

  @Post('verify-code')
  @ApiOperation({ summary: 'Verify SMS code' })
  @ApiResponse({ status: 200, description: 'Phone verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid code' })
  async verifyCode(@Body() verifyCodeDto: VerifyCodeDto) {
    return this.authService.verifyPhoneCode(verifyCodeDto.phone, verifyCodeDto.code);
  }

  @Post('forgot-password/request-otp')
  @ApiOperation({ summary: 'Send password reset OTP by email' })
  @ApiResponse({ status: 200, description: 'Reset OTP sent' })
  async requestForgotPasswordOtp(@Body() dto: ForgotPasswordRequestDto) {
    return this.authService.requestPasswordResetOtp(dto.email);
  }

  @Post('forgot-password/reset')
  @ApiOperation({ summary: 'Reset password using email OTP' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  async resetForgotPassword(@Body() dto: ForgotPasswordResetDto) {
    return this.authService.resetPasswordWithOtp(dto.email, dto.code, dto.newPassword);
  }

  @Post('verify-phone/send')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Send WhatsApp verification code' })
  @ApiResponse({ status: 200, description: 'WhatsApp code sent' })
  async sendWhatsAppCode(@Body() sendWhatsAppCodeDto: SendWhatsAppCodeDto) {
    return this.authService.sendWhatsAppCode(sendWhatsAppCodeDto.phone);
  }

  @Post('verify-phone/confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Verify WhatsApp code' })
  @ApiResponse({ status: 200, description: 'Phone verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid code' })
  async verifyWhatsAppCode(@Body() verifyWhatsAppCodeDto: VerifyWhatsAppCodeDto) {
    return this.authService.verifyWhatsAppCode(verifyWhatsAppCodeDto.phone, verifyWhatsAppCodeDto.code);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  async getProfile(@Req() req: Request) {
    const user = req.user as any;
    return this.authService.getProfile(user.id);
  }
}

