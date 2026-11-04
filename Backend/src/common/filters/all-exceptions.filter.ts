import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/** * Every error the API returns has this shape: *. */
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: string[];
  path: string;
  timestamp: string;
}

const CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_ERROR',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Something went wrong. Please try again later.';
    let details: string[] | undefined;
    let code = CODES[500];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = CODES[status] ?? 'ERROR';

      const body = exception.getResponse();
      const raw =
        typeof body === 'string' ? body : (body as { message?: unknown }).message;

      if (Array.isArray(raw)) {
        // class-validator returns an array of messages
        code = 'VALIDATION_ERROR';
        message = 'Validation failed';
        details = raw.map(String);
      } else if (typeof raw === 'string') {
        message = raw;
      }

      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        message = 'Too many requests. Please wait a moment and try again.';
      }
    } else {
      // Unknown error: log it, but never leak internals to the client.
      this.logger.error(
        `${req.method} ${req.originalUrl}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const payload: ApiErrorBody = {
      statusCode: status,
      code,
      message,
      ...(details ? { details } : {}),
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    };

    res.status(status).json(payload);
  }
}
