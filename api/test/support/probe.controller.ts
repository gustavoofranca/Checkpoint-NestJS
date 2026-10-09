import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';

export class ProbeDto {
  @IsString()
  @Length(1, 20)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;
}

// Test-only routes that drive the global pipeline: body parsing, validation and error mapping.
@Controller('probe')
export class ProbeController {
  @Post()
  @HttpCode(200)
  echo(@Body() body: ProbeDto): ProbeDto {
    return body;
  }

  @Get('crash')
  crash(): never {
    throw new Error('relation "users" does not exist at /srv/app/dist/users.repository.js:42');
  }
}
