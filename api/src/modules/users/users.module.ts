import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PasswordHasher } from './password-hasher';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [UsersService, PasswordHasher],
  exports: [UsersService, PasswordHasher],
})
export class UsersModule {}
