import type { LootEntry } from "@prisma/client";

/** who gets a part of a contribution, and how big their part is relative to the others */
export type Beneficiary = { userId: string; weight: bigint };

/** kept = an item the member keeps (not Noah they can hand over). */
export type Contribution = { amount: bigint; holderId: string; kept?: boolean; beneficiaries?: Beneficiary[] };

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
      // legacy: the receiver kept the item, so its value counts as already received by them
      return { amount: e.value, holderId: e.receiverId ?? e.holderId, kept: true };
    default:
      return null; // unsold stock is not shared yet
  }
}

/**
 * Splits amount by weight. Each part is rounded down and the leftover Noah is
 * handed out 1 by 1 to the biggest fractions (ties by id), so parts add up exactly.
 */
export function allocate(amount: bigint, beneficiaries: Beneficiary[]): Map<string, bigint> {
  const merged = new Map<string, bigint>();
  for (const b of beneficiaries) if (b.weight > 0n) merged.set(b.userId, (merged.get(b.userId) ?? 0n) + b.weight);
  const out = new Map<string, bigint>();
  const total = [...merged.values()].reduce((a, w) => a + w, 0n);
  if (total === 0n || amount === 0n) {
    for (const id of merged.keys()) out.set(id, 0n);
    return out;
  }
  const rows = [...merged].map(([userId, w]) => ({ userId, base: (amount * w) / total, frac: (amount * w) % total }));
  let left = amount - rows.reduce((a, r) => a + r.base, 0n);
  rows
    .slice()
    .sort((a, b) => (a.frac > b.frac ? -1 : a.frac < b.frac ? 1 : a.userId < b.userId ? -1 : 1))
    .forEach((r) => {
      if (left > 0n) {
        r.base += 1n;
        left -= 1n;
      }
    });
  for (const r of rows) out.set(r.userId, r.base);
  return out;
}

export type ShareRow = { userId: string; share: bigint; held: bigint; kept: bigint; balance: bigint };
export type TransferKind = "DELIVERY" | "PAYOUT";
export type TransferRow = { fromId: string; toId: string; amount: bigint; kind: TransferKind };

/**
 * Every contribution is split among its own beneficiaries (coin: the farm team by
 * time present, a sold item: its owners equally). balance > 0 means the member
 * holds more than their share.
 */
export function computeSettlement(contributions: Contribution[], collectorId: string) {
  const share = new Map<string, bigint>();
  const held = new Map<string, bigint>();
  const kept = new Map<string, bigint>();
  let total = 0n;
  for (const c of contributions) {
    total += c.amount;
    held.set(c.holderId, (held.get(c.holderId) ?? 0n) + c.amount);
    if (c.kept) kept.set(c.holderId, (kept.get(c.holderId) ?? 0n) + c.amount);
    const bens = c.beneficiaries?.length ? c.beneficiaries : [{ userId: c.holderId, weight: 1n }];
    for (const [id, part] of allocate(c.amount, bens)) share.set(id, (share.get(id) ?? 0n) + part);
  }
  const ids = new Set<string>([...share.keys(), ...held.keys(), collectorId]);
  const shares: ShareRow[] = [...ids].sort().map((userId) => {
    const s = share.get(userId) ?? 0n;
    const h = held.get(userId) ?? 0n;
    return { userId, share: s, held: h, kept: kept.get(userId) ?? 0n, balance: h - s };
  });
  const sharers = shares.filter((s) => s.share > 0n).length;
  const perShare = sharers ? total / BigInt(sharers) : 0n; // average, for display
  const remainder = sharers ? total - perShare * BigInt(sharers) : 0n;
  return { total, perShare, remainder, shares, transfers: collectorTransfers(shares, collectorId) };
}

/**
 * Coin and items are handed to the clan vault account while collecting, so the
 * vault only has to pay every member their share (PAYOUT). Items a member kept
 * (legacy "given") are deducted from their payout.
 */
export function collectorTransfers(shares: ShareRow[], collectorId: string): TransferRow[] {
  const out: TransferRow[] = [];
  for (const s of shares) {
    if (s.userId === collectorId) continue;
    const payout = s.share - s.kept;
    if (payout > 0n) out.push({ fromId: collectorId, toId: s.userId, amount: payout, kind: "PAYOUT" });
  }
  return out;
}
