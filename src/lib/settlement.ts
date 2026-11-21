import type { LootEntry } from "@prisma/client";

/** kept = an item the member keeps (not Noah they can hand over). */
export type Contribution = { amount: bigint; holderId: string; kept?: boolean };

/** What a loot entry contributes to the pot, and who currently holds that value. */
export function lootContribution(
  e: Pick<LootEntry, "status" | "value" | "salePrice" | "holderId" | "soldById" | "receiverId">,
): Contribution | null {
  switch (e.status) {
    case "COIN":
      return { amount: e.value, holderId: e.holderId, kept: false };
    case "SOLD":
      return { amount: e.salePrice ?? 0n, holderId: e.soldById ?? e.holderId, kept: false };
    case "GIVEN":
      // the receiver keeps the item, so its value counts as already received by them
      return { amount: e.value, holderId: e.receiverId ?? e.holderId, kept: true };
    default:
      return null; // unsold stock is not shared yet
  }
}

export type ShareRow = { userId: string; share: bigint; held: bigint; kept: bigint; balance: bigint };
export type TransferKind = "DELIVERY" | "PAYOUT" | "DIRECT";
export type TransferRow = { fromId: string; toId: string; amount: bigint; kind: TransferKind };

/**
 * Equal split of the pot among members. The leftover Noah (total % n) is given
 * 1 Noah each to the first members so the shares add up exactly to the total.
 * balance > 0 means the member holds more than their share and must give it away.
 */
export function computeSettlement(
  memberIds: string[],
  contributions: Contribution[],
  collectorId?: string | null,
) {
  const members = [...new Set(memberIds)].sort();
  const n = BigInt(members.length);
  const held = new Map<string, bigint>(members.map((m) => [m, 0n]));
  const kept = new Map<string, bigint>();
  let total = 0n;
  for (const c of contributions) {
    total += c.amount;
    held.set(c.holderId, (held.get(c.holderId) ?? 0n) + c.amount);
    if (c.kept) kept.set(c.holderId, (kept.get(c.holderId) ?? 0n) + c.amount);
  }
  if (collectorId && !held.has(collectorId)) held.set(collectorId, 0n);
  const perShare = n > 0n ? total / n : 0n;
  const remainder = n > 0n ? total - perShare * n : 0n;

  const shares: ShareRow[] = [];
  members.forEach((userId, i) => {
    const share = perShare + (BigInt(i) < remainder ? 1n : 0n);
    const h = held.get(userId) ?? 0n;
    shares.push({ userId, share, held: h, kept: kept.get(userId) ?? 0n, balance: h - share });
  });
  // someone outside the team holds loot (e.g. sold by a non-member): they owe all of it
  for (const [userId, h] of held) {
    if (!members.includes(userId) && (h !== 0n || userId === collectorId)) {
      shares.push({ userId, share: 0n, held: h, kept: kept.get(userId) ?? 0n, balance: h });
    }
  }

  const transfers = collectorId ? collectorTransfers(shares, collectorId) : minimizeTransfers(shares);
  return { total, perShare, remainder, shares, transfers };
}

/**
 * Collector mode: everyone hands the Noah they hold to one member (DELIVERY),
 * then that member pays every share out (PAYOUT). Items a member kept are
 * deducted from their payout; if the item is worth more than their share,
 * they hand the difference over as well.
 */
export function collectorTransfers(shares: ShareRow[], collectorId: string): TransferRow[] {
  const out: TransferRow[] = [];
  for (const s of shares) {
    if (s.userId === collectorId) continue;
    const cash = s.held - s.kept;
    let payout = s.share - s.kept;
    let delivery = cash;
    if (payout < 0n) {
      delivery += -payout;
      payout = 0n;
    }
    if (delivery > 0n) out.push({ fromId: s.userId, toId: collectorId, amount: delivery, kind: "DELIVERY" });
    if (payout > 0n) out.push({ fromId: collectorId, toId: s.userId, amount: payout, kind: "PAYOUT" });
  }
  return out;
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
    out.push({ fromId: d.id, toId: c.id, amount: amt, kind: "DIRECT" });
    d.amt -= amt;
    c.amt -= amt;
    if (d.amt === 0n) debtors.shift();
    if (c.amt === 0n) creditors.shift();
  }
  return out;
}
