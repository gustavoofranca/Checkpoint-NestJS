import { type ArgumentsHost, Catch, type ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { isExpectedError, toProblemDetails } from './problem-details';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = typeof request.id === 'string' ? request.id : undefined;

    if (!isExpectedError(exception)) {
      this.logger.error({ err: exception, requestId }, 'Unexpected error');
    }

    const problem = toProblemDetails(exception, requestId);
    response.status(problem.status).type('application/problem+json').json(problem);
  }
}
