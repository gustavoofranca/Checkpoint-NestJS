import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';

export function normalizeEmail({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

// Only these three fields are accepted; anything else, `role` included, is rejected with 400 by
// the global ValidationPipe (forbidNonWhitelisted).
export class RegisterDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Matches(/^[a-z0-9_]{3,24}$/, {
    message: 'username must be 3 to 24 lowercase letters, digits or underscores',
  })
  username!: string;

  // Length only, no composition rules (docs/SECURITY.md section 2).
  @IsString()
  @Length(12, 128)
  password!: string;
}
