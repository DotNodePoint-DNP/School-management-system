import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';

type Db = Pick<Prisma.TransactionClient, '$queryRaw'>;

@Injectable()
export class DayLockService {
  async isClosed(db: Db, isoDate: string): Promise<boolean> {
    const rows = await db.$queryRaw<
      { closed: boolean }[]
    >`SELECT public.day_is_closed(${isoDate}::date) AS closed`;
    return rows[0]?.closed === true;
  }

  /**
   * Anything that moves cash on a date takes a shared lock on that date, so a close waits for it (and it sees a close once
   * that has committed). The database triggers are the backstop. Lock order: fiscal year, then day.
   */
  async assertOpen(
    tx: Prisma.TransactionClient,
    isoDate: string,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtext(${`day:${isoDate}`}))`;
    if (await this.isClosed(tx, isoDate)) {
      throw new ConflictException(
        `The collection for ${isoDate} has been closed. Someone who may reopen days must reopen it before anything more is recorded for that date.`,
      );
    }
  }
}
