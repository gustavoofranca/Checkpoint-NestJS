import { type DynamicModule, Global, Module } from '@nestjs/common';
import { AppConfig } from './app-config';

// The configuration is parsed once in main.ts, before Nest starts, and handed in here.
// Tests build their own AppConfig instead of mutating process.env.
@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: AppConfig, useValue: config }],
      exports: [AppConfig],
    };
  }
}
