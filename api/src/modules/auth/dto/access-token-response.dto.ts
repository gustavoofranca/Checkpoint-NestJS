import { ApiProperty } from '@nestjs/swagger';

export class AccessTokenResponseDto {
  @ApiProperty({ description: 'JWT to send as "Authorization: Bearer <token>"' })
  accessToken!: string;

  @ApiProperty({ enum: ['Bearer'] })
  tokenType!: 'Bearer';

  // Seconds, as in OAuth 2.0 token responses.
  @ApiProperty({ example: 900, description: 'Lifetime in seconds' })
  expiresIn!: number;
}
