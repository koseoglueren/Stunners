import { allocate } from "./settlement";

/** vault items with the same name and plus level are shown and sold as one line */
export function vaultKey(l: { itemName: string; plusLevel: number | null }) {
  return `${l.itemName.trim().toLocaleLowerCase("tr")}|${l.plusLevel ?? ""}`;
}

export type SaleRow = { id: string; quantity: number; value: bigint };
export type SalePart = {
  id: string;
  /** units of this record that were sold */
  sold: number;
  /** units left in the vault (0 = the whole record is sold) */
  left: number;
  /** this record's part of the sale price */
  price: bigint;
  /** estimated value moving with the sold units */
  soldValue: bigint;
};

/**
 * Sell `qty` units of one grouped vault item for `price` in total.
 * Units are taken oldest record first; the price is split over the records by units sold,
 * so each record's money goes to that record's own owners.
 */
export function planGroupSale(rows: SaleRow[], qty: number, price: bigint): SalePart[] {
  const total = rows.reduce((a, r) => a + r.quantity, 0);
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("Satılan adet en az 1 olmalı.");
  if (qty > total) throw new Error(`Kasada sadece ${total} adet var.`);
  let need = qty;
  const picked: { r: SaleRow; sold: number }[] = [];
  for (const r of rows) {
    if (need === 0) break;
    const sold = Math.min(r.quantity, need);
    if (sold <= 0) continue;
    picked.push({ r, sold });
    need -= sold;
  }
  const prices = allocate(price, picked.map(({ r, sold }) => ({ userId: r.id, weight: BigInt(sold) })));
  return picked.map(({ r, sold }) => ({
    id: r.id,
    sold,
    left: r.quantity - sold,
    price: prices.get(r.id) ?? 0n,
    soldValue: sold === r.quantity ? r.value : (r.value * BigInt(sold)) / BigInt(r.quantity),
  }));
}
