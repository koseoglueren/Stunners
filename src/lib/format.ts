import type { CharClass, LootCategory, LootStatus, Role, TransferStatus } from "@prisma/client";

/** 1234567 -> "1.234.567" */
export function noah(n: bigint | number | null | undefined) {
  if (n === null || n === undefined) return "-";
  const v = typeof n === "bigint" ? n : BigInt(Math.round(n));
  const neg = v < 0n;
  const s = (neg ? -v : v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-" : "") + s;
}

/** 1234567 -> "1,23M" */
export function noahShort(n: bigint | number | null | undefined) {
  if (n === null || n === undefined) return "-";
  const v = Number(n);
  const abs = Math.abs(v);
  const fmt = (x: number) => x.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
  if (abs >= 1e9) return fmt(v / 1e9) + "B";
  if (abs >= 1e6) return fmt(v / 1e6) + "M";
  if (abs >= 1e3) return fmt(v / 1e3) + "K";
  return fmt(v);
}

/**
 * Accepts "150m", "1,5b", "250k", "1.000.000", "1000000", "2.5M".
 * Returns null when it cannot parse.
 */
export function parseNoah(input: FormDataEntryValue | string | null | undefined): bigint | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim().toLowerCase().replace(/\s/g, "");
  if (!s) return null;
  let mult = 1;
  const suffix = s.at(-1);
  if (suffix === "k" || suffix === "m" || suffix === "b") {
    mult = suffix === "k" ? 1e3 : suffix === "m" ? 1e6 : 1e9;
    s = s.slice(0, -1);
    // with a suffix, "." or "," is a decimal separator
    s = s.replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    return BigInt(Math.round(parseFloat(s) * mult));
  }
  // without suffix, dots/commas are thousand separators
  s = s.replace(/[.,]/g, "");
  if (!/^\d+$/.test(s)) return null;
  return BigInt(s);
}

export const roleLabel: Record<Role, string> = {
  LEADER: "Lider",
  OFFICER: "Yönetici",
  MEMBER: "Üye",
};

export const classLabel: Record<CharClass, string> = {
  WARRIOR: "Warrior",
  ROGUE: "Rogue",
  MAGE: "Mage",
  PRIEST: "Priest",
  KURIAN: "Kurian",
};

export const categoryLabel: Record<LootCategory, string> = {
  COIN: "Coin (Noah)",
  SCROLL: "Upgrade Scroll",
  WEAPON: "Weapon",
  ARMOR: "Armor",
  MATERIAL: "Taş / Malzeme",
  OTHER: "Diğer",
};

export const lootStatusLabel: Record<LootStatus, string> = {
  COIN: "Coin",
  IN_STOCK: "Satılmadı",
  SOLD: "Satıldı",
  GIVEN: "Üyeye verildi",
};

export const transferStatusLabel: Record<TransferStatus, string> = {
  PENDING: "Bekliyor",
  SENT: "Gönderildi",
  RECEIVED: "Alındı",
};

export function durationText(start: Date, end: Date | null | undefined) {
  const ms = (end ?? new Date()).getTime() - start.getTime();
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h} sa ${m} dk` : `${m} dk`;
}

export function hoursBetween(start: Date, end: Date | null | undefined) {
  return Math.max(0, ((end ?? new Date()).getTime() - start.getTime()) / 3_600_000);
}
