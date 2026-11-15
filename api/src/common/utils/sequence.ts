import type { Prisma } from '../../generated/prisma/client.js';

/** Atomically increments and returns a named counter. Call it inside the transaction that uses the number. */
export async function nextSequence(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  name: string,
): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO sequences (name, value) VALUES (${name}, 1)
    ON CONFLICT (name) DO UPDATE SET value = sequences.value + 1
    RETURNING value`;
  const row = rows[0];
  if (!row) throw new Error(`Sequence "${name}" returned no value`);
  return row.value;
}

/**
 * Reserves `count` consecutive numbers and returns the first. The counter row stays locked until the caller's
 * transaction ends, so numbers stay gapless even if the transaction fails.
 */
export async function reserveSequence(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  name: string,
  count: number,
): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO sequences (name, value) VALUES (${name}, ${count})
    ON CONFLICT (name) DO UPDATE SET value = sequences.value + ${count}
    RETURNING value`;
  const row = rows[0];
  if (!row) throw new Error(`Sequence "${name}" returned no value`);
  return row.value - count + 1;
}
