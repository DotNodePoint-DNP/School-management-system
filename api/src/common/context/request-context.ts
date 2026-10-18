import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function requestContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  requestContext.run(
    {
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent']?.slice(0, 255) ?? null,
    },
    next,
  );
}
