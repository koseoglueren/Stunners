import type { LootEntry } from "@prisma/client";
import { lootContribution } from "./settlement";

type Share = { userId: string; share: bigint; kept: bigint };
type T = { id?: string; fromId: string; toId: string; amount: bigint; kind: string; status?: string };
type Loot = Pick<LootEntry, "id" | "itemName" | "plusLevel" | "quantity" | "status" | "value" | "salePrice" | "holderId" | "soldById" | "receiverId">;

export type CollectorRow = {
  userId: string;
  share: bigint;
  kept: bigint;
  delivery?: T;
  payout?: T;
  /** what this member brought in: coin, sale proceeds, items they kept */
  lines: { label: string; amount: bigint; kept: boolean }[];
  /** unsold items handed to the collector */
  items: string[];
};

export function itemLabel(l: Pick<LootEntry, "itemName" | "plusLevel" | "quantity">) {
  return `${l.itemName}${l.plusLevel !== null ? ` +${l.plusLevel}` : ""}${l.quantity > 1 ? ` ×${l.quantity}` : ""}`;
}

export function buildCollectorRows(
  collectorId: string,
  shares: Share[],
  transfers: T[],
  loot: Loot[],
  handedItems: (Loot & { handedOverById: string | null })[],
): CollectorRow[] {
  const ids = new Set<string>(shares.map((s) => s.userId));
  const rows = new Map<string, CollectorRow>();
  for (const id of ids) {
    const s = shares.find((x) => x.userId === id)!;
    rows.set(id, { userId: id, share: s.share, kept: s.kept, lines: [], items: [] });
  }
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { userId: id, share: 0n, kept: 0n, lines: [], items: [] };
      rows.set(id, r);
    }
    return r;
  };
  for (const l of loot) {
    const c = lootContribution(l);
    if (!c) continue;
    const label = l.status === "COIN" ? "Coin" : l.status === "SOLD" ? `${itemLabel(l)} satışı` : `${itemLabel(l)} (kendisi aldı)`;
    row(c.holderId).lines.push({ label, amount: c.amount, kept: !!c.kept });
  }
  for (const l of handedItems) row(l.handedOverById ?? l.holderId).items.push(itemLabel(l));
  for (const t of transfers) {
    if (t.kind === "DELIVERY") row(t.fromId).delivery = t;
    if (t.kind === "PAYOUT") row(t.toId).payout = t;
  }
  return [...rows.values()].sort((a, b) => (a.userId === collectorId ? -1 : b.userId === collectorId ? 1 : 0));
}
