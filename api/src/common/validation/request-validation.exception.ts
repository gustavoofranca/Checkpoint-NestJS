import { BadRequestException } from '@nestjs/common';

export interface FieldError {
  field: string;
  message: string;
}

export class RequestValidationException extends BadRequestException {
  constructor(readonly errors: readonly FieldError[]) {
    super('The request contains invalid fields.');
  }
}
