import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PasswordHasher } from './password-hasher';
import { UsersService } from './users.service';

@Module({
  imports: [PrismaModule],
  providers: [UsersService, PasswordHasher],
  exports: [UsersService, PasswordHasher],
})
export class UsersModule {}
