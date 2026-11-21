import type { LootEntry } from "@prisma/client";

/** What a loot entry contributes to the pot, and who currently holds that value. */
export function lootContribution(
  e: Pick<LootEntry, "status" | "value" | "salePrice" | "holderId" | "soldById" | "receiverId">,
): { amount: bigint; holderId: string } | null {
  switch (e.status) {
    case "COIN":
      return { amount: e.value, holderId: e.holderId };
    case "SOLD":
      return { amount: e.salePrice ?? 0n, holderId: e.soldById ?? e.holderId };
    case "GIVEN":
      // the receiver keeps the item, so its value counts as already received by them
      return { amount: e.value, holderId: e.receiverId ?? e.holderId };
    default:
      return null; // unsold stock is not shared yet
  }
}

export type ShareRow = { userId: string; share: bigint; held: bigint; balance: bigint };
export type TransferRow = { fromId: string; toId: string; amount: bigint };

/**
 * Equal split of the pot among members. The leftover Noah (total % n) is given
 * 1 Noah each to the first members so the shares add up exactly to the total.
 * balance > 0 means the member holds more than their share and must give it away.
 */
export function computeSettlement(
  memberIds: string[],
  contributions: { amount: bigint; holderId: string }[],
) {
  const members = [...new Set(memberIds)].sort();
  const n = BigInt(members.length);
  const held = new Map<string, bigint>(members.map((m) => [m, 0n]));
  let total = 0n;
  for (const c of contributions) {
    total += c.amount;
    held.set(c.holderId, (held.get(c.holderId) ?? 0n) + c.amount);
  }
  const perShare = n > 0n ? total / n : 0n;
  const remainder = n > 0n ? total - perShare * n : 0n;

  const shares: ShareRow[] = [];
  members.forEach((userId, i) => {
    const share = perShare + (BigInt(i) < remainder ? 1n : 0n);
    const h = held.get(userId) ?? 0n;
    shares.push({ userId, share, held: h, balance: h - share });
  });
  // someone outside the team holds loot (e.g. sold by a non-member): they owe all of it
  for (const [userId, h] of held) {
    if (!members.includes(userId) && h !== 0n) {
      shares.push({ userId, share: 0n, held: h, balance: h });
    }
  }

  return { total, perShare, remainder, shares, transfers: minimizeTransfers(shares) };
}

/** Greedy: biggest debtor pays biggest creditor. Gives at most n-1 transfers. */
export function minimizeTransfers(shares: ShareRow[]): TransferRow[] {
  const debtors = shares.filter((s) => s.balance > 0n).map((s) => ({ id: s.userId, amt: s.balance }));
  const creditors = shares.filter((s) => s.balance < 0n).map((s) => ({ id: s.userId, amt: -s.balance }));
  const out: TransferRow[] = [];
  const byAmt = (a: { amt: bigint }, b: { amt: bigint }) => (a.amt > b.amt ? -1 : a.amt < b.amt ? 1 : 0);
  while (debtors.length && creditors.length) {
    debtors.sort(byAmt);
    creditors.sort(byAmt);
    const d = debtors[0];
    const c = creditors[0];
    const amt = d.amt < c.amt ? d.amt : c.amt;
    out.push({ fromId: d.id, toId: c.id, amount: amt });
    d.amt -= amt;
    c.amt -= amt;
    if (d.amt === 0n) debtors.shift();
    if (c.amt === 0n) creditors.shift();
  }
  return out;
}
