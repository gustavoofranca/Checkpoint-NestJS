import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FieldErrorDto } from './field-error.dto';

// OpenAPI description of the error body (RFC 9457) that ProblemDetailsFilter writes.
export class ProblemDetailsDto {
  @ApiProperty({ example: 'about:blank' })
  type!: string;

  @ApiProperty({ example: 'Not Found' })
  title!: string;

  @ApiProperty({ example: 404 })
  status!: number;

  @ApiProperty({ example: 'Game not found.' })
  detail!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Also sent as the X-Request-Id header' })
  requestId?: string;

  @ApiPropertyOptional({ type: [FieldErrorDto], description: 'Validation errors only' })
  errors?: FieldErrorDto[];
}
