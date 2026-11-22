import type { Beneficiary } from "./settlement";

export type PartyMember = { userId: string; joinedAt: Date | null; leftAt: Date | null };
type Session = { startAt: Date; endAt: Date | null; members: PartyMember[] };

/** when a member was in the party, clamped to the farm's start/end */
export function presence(m: PartyMember, s: Pick<Session, "startAt" | "endAt">, now = new Date()) {
  const end = s.endAt ?? now;
  const from = m.joinedAt && m.joinedAt > s.startAt ? m.joinedAt : s.startAt;
  const to = m.leftAt && m.leftAt < end ? m.leftAt : end;
  return { from, to, minutes: Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000)) };
}

/** coin of a farm is split by minutes spent in the party; full-time members get equal parts */
export function coinBeneficiaries(s: Session, now = new Date()): Beneficiary[] {
  const rows = s.members.map((m) => ({ userId: m.userId, weight: BigInt(presence(m, s, now).minutes) }));
  if (rows.every((r) => r.weight === 0n)) return s.members.map((m) => ({ userId: m.userId, weight: 1n }));
  return rows;
}

/** members in the party when an item dropped (default owners of that item) */
export function presentAt(s: Session, at: Date): string[] {
  const ids = s.members.filter((m) => !(m.joinedAt && m.joinedAt > at) && !(m.leftAt && m.leftAt < at)).map((m) => m.userId);
  return ids.length ? ids : s.members.map((m) => m.userId);
}

/** owners of an item: the admin's list if edited, else whoever was in the party when it dropped */
export function itemOwners(
  loot: { customOwners: boolean; droppedAt: Date; owners?: { userId: string }[] },
  s: Session | null,
): string[] {
  if (loot.customOwners && loot.owners?.length) return loot.owners.map((o) => o.userId);
  return s ? presentAt(s, loot.droppedAt) : [];
}

export function lootBeneficiaries(
  loot: { status: string; customOwners: boolean; droppedAt: Date; owners?: { userId: string }[] },
  s: Session | null,
  now = new Date(),
): Beneficiary[] {
  if (loot.status === "COIN") return s ? coinBeneficiaries(s, now) : [];
  return itemOwners(loot, s).map((userId) => ({ userId, weight: 1n }));
}
