import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Single exit point for errors.
 *
 * Two jobs: turn Postgres error codes into sensible HTTP responses, and make
 * sure an unexpected failure never returns a stack trace or a raw database
 * message to the client. Those leak schema details, and in a system holding HR
 * and health records that is a reportable problem, not a nuisance.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    // The response may already be streaming a document by the time something
    // fails; writing a JSON body on top would corrupt the download.
    if (res.headersSent) {
      res.destroy();
      return;
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: string | object = { message: 'Internal server error' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      body = exception.getResponse();
    } else if (isPostgresError(exception)) {
      ({ status, body } = this.fromPostgres(exception));
    }

    if (status >= 500) {
      this.logger.error(`${req.method} ${req.url}`, exception as Error);
    } else {
      this.logger.warn(`${req.method} ${req.url} -> ${status}`);
    }

    const payload = typeof body === 'string' ? { message: body } : body;
    res.status(status).json({
      statusCode: status,
      path: req.url,
      timestamp: new Date().toISOString(),
      ...payload,
    });
  }

  /**
   * Maps SQLSTATE codes, which are the standard's, not the driver's — so this
   * mapping stays correct regardless of what sits between us and Postgres.
   *
   * `constraint` is passed back for uniqueness violations because the client
   * needs to know WHICH field collided; the detail string is not, since it
   * quotes the offending value and that value may be someone's email address.
   */
  private fromPostgres(err: PostgresError): { status: number; body: object } {
    switch (err.code) {
      case '23505': // unique_violation
        return {
          status: HttpStatus.CONFLICT,
          body: { message: 'That value is already taken', constraint: err.constraint },
        };
      case '23503': // foreign_key_violation
        return { status: HttpStatus.BAD_REQUEST, body: { message: 'Related record does not exist' } };
      case '23502': // not_null_violation
        return {
          status: HttpStatus.BAD_REQUEST,
          body: { message: `"${err.column ?? 'A required field'}" cannot be empty` },
        };
      case '23514': // check_violation
        return { status: HttpStatus.BAD_REQUEST, body: { message: 'That value is not allowed here' } };
      case '22001': // string_data_right_truncation
        return { status: HttpStatus.BAD_REQUEST, body: { message: 'A value is too long for its field' } };
      case '22P02': // invalid_text_representation — a malformed enum or number
        return { status: HttpStatus.BAD_REQUEST, body: { message: 'A value is not in the expected format' } };
      case '40001': // serialization_failure
      case '40P01': // deadlock_detected
        return {
          status: HttpStatus.CONFLICT,
          body: { message: 'That conflicted with another change. Try again.' },
        };
      case '57014': // query_canceled — statement timeout
        return { status: HttpStatus.GATEWAY_TIMEOUT, body: { message: 'The query took too long' } };

      // The append-only trigger on audit_events raises this deliberately.
      case 'P0001': // raise_exception
        return { status: HttpStatus.FORBIDDEN, body: { message: err.message } };

      default:
        this.logger.error(`Unmapped Postgres error ${err.code}: ${err.message}`);
        return { status: HttpStatus.INTERNAL_SERVER_ERROR, body: { message: 'Database error' } };
    }
  }
}

interface PostgresError extends Error {
  /** SQLSTATE, always five characters. */
  code: string;
  constraint?: string;
  column?: string;
  table?: string;
}

/**
 * node-postgres does not export an error class to instanceof against, so the
 * check is structural: an Error carrying a five-character SQLSTATE.
 */
function isPostgresError(err: unknown): err is PostgresError {
  return (
    err instanceof Error &&
    typeof (err as PostgresError).code === 'string' &&
    /^[0-9A-Z]{5}$/.test((err as PostgresError).code)
  );
}
