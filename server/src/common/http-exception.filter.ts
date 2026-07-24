import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : Array.isArray((body as { message?: unknown }).message)
            ? ((body as { message: string[] }).message).join(', ')
            : ((body as { message?: string }).message ?? exception.message);

      res.status(status).json({
        ok: false,
        statusCode: status,
        error: exception.name.replace(/Exception$/, ''),
        message,
      });
      return;
    }

    const message =
      exception instanceof Error ? exception.message : 'Internal server error';
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      ok: false,
      statusCode: 500,
      error: 'InternalServerError',
      message,
    });
  }
}
