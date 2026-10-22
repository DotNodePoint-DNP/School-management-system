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
