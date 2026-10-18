import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  CursorPaginated,
  Paginated,
  type CursorMeta,
  type PageMeta,
} from '../dto/pagination.dto.js';

interface Envelope {
  success: true;
  data: unknown;
  meta?: PageMeta | CursorMeta;
}

@Injectable()
export class ResponseInterceptor implements NestInterceptor<unknown, Envelope> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<Envelope> {
    return next
      .handle()
      .pipe(
        map((data): Envelope =>
          data instanceof Paginated || data instanceof CursorPaginated
            ? { success: true, data: data.items, meta: data.meta }
            : { success: true, data },
        ),
      );
  }
}
