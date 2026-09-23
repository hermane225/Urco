import { BadRequestException } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomBytes } from 'crypto';

export const LogoUploadInterceptor = AnyFilesInterceptor({
  storage: diskStorage({
    destination: (req, file, cb) => cb(null, join(process.cwd(), 'uploads')),
    filename: (req, file, cb) => cb(null, `logo-${randomBytes(16).toString('hex')}${extname(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) {
      return cb(new BadRequestException('Le logo doit être une image'), false);
    }
    cb(null, true);
  },
});

export function logoPathFrom(files?: Express.Multer.File[]): string | undefined {
  const file = files?.find((f) => f.fieldname === 'logo') ?? files?.[0];
  return file ? `/uploads/${file.filename}` : undefined;
}
