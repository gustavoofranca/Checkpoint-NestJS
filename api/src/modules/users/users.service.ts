import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Role } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { USER_RESPONSE_SELECT, type UserResponseDto } from './dto/user-response.dto';

// Same message whether the email or the username is taken, so registration does not confirm
// which one exists (docs/SECURITY.md section 2).
export const REGISTRATION_CONFLICT = 'This email or username cannot be used.';

export interface NewUser {
  email: string;
  username: string;
  passwordHash: string;
}

export interface UserCredentials {
  id: string;
  role: Role;
  passwordHash: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // The unique constraints decide; there is no read-then-write check to race.
  async create(user: NewUser): Promise<UserResponseDto> {
    try {
      return await this.prisma.user.create({
        data: { email: user.email, username: user.username, passwordHash: user.passwordHash },
        select: USER_RESPONSE_SELECT,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(REGISTRATION_CONFLICT);
      }
      throw error;
    }
  }

  findCredentials(email: string): Promise<UserCredentials | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true, passwordHash: true },
    });
  }

  async findAccount(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_RESPONSE_SELECT,
    });
    if (user === null) {
      throw new NotFoundException('Account not found.');
    }
    return user;
  }
}
