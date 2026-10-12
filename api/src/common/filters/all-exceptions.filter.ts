import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';

const PRISMA_ERRORS: Record<string, { status: number; message: string }> = {
  P2002: {
    status: HttpStatus.CONFLICT,
    message: 'A record with these values already exists',
  },
  P2025: { status: HttpStatus.NOT_FOUND, message: 'Record not found' },
  P2003: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Related record does not exist or is still in use',
  },
};

function isKnownPrismaError(
  exception: unknown,
): exception is Prisma.PrismaClientKnownRequestError {
  return exception instanceof Prisma.PrismaClientKnownRequestError;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ??
            exception.message);
    } else if (isKnownPrismaError(exception)) {
      const prismaError = PRISMA_ERRORS[exception.code];
      if (prismaError) {
        ({ status, message } = prismaError);
      }
    } else {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res
      .status(status)
      .json({ success: false, error: { statusCode: status, message } });
  }
}
