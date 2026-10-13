import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { normalizeEmail } from './register.dto';

export class LoginDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // No minimum beyond non-empty: a login form should not hint at the password policy.
  @IsString()
  @Length(1, 128)
  password!: string;
}
