import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { PrismaClient } from '../generated/prisma/client';
import { createPrismaAdapter } from './create-prisma-client';

// Connects on first query rather than on module init: the process must start while the database
// is down, so /health/ready can report it instead of the app crash-looping.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: AppConfig) {
    super({ adapter: createPrismaAdapter(config.databaseUrl) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
