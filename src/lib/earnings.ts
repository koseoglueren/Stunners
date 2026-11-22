import { allocate, lootContribution } from "./settlement";
import { lootBeneficiaries, type PartyMember } from "./shares";
import type { LootEntry } from "@prisma/client";

type Loot = Pick<LootEntry, "status" | "value" | "salePrice" | "holderId" | "soldById" | "receiverId" | "customOwners" | "droppedAt"> & {
  owners?: { userId: string }[];
};
type Session = { startAt: Date; endAt: Date | null; members: PartyMember[]; loot: Loot[] };

/** what a farm earned (coin + sold items) and each member's part of it */
export function sessionEarnings(s: Session, now = new Date()) {
  let total = 0n;
  const perMember = new Map<string, bigint>();
  for (const l of s.loot) {
    const c = lootContribution(l);
    if (!c || c.amount === 0n) continue;
    total += c.amount;
    for (const [uid, amt] of allocate(c.amount, lootBeneficiaries(l, s, now))) perMember.set(uid, (perMember.get(uid) ?? 0n) + amt);
  }
  return { total, perMember };
}

/** per-member earnings for each loot entry (used for daily charts) */
export function lootEarnings(l: Loot, s: Omit<Session, "loot">, now = new Date()) {
  const c = lootContribution(l);
  if (!c || c.amount === 0n) return null;
  return { amount: c.amount, perMember: allocate(c.amount, lootBeneficiaries(l, s, now)) };
}
