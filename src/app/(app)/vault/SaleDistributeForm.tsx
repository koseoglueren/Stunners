"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "@/components/client";

type Sale = { id: string; key: string; label: string; qty: number; where: string; price: string; owners: string[] };
type Group = { key: string; label: string; qty: number; price: bigint; ids: string[]; owners: string[]; where: string[] };

/** same item (name + plus level) on one line: total count and total money */
function groupSales(sales: Sale[]): Group[] {
  const map = new Map<string, Group>();
  for (const s of sales) {
    const g = map.get(s.key) ?? { key: s.key, label: s.label, qty: 0, price: 0n, ids: [], owners: [], where: [] };
    g.qty += s.qty;
    g.price += BigInt(s.price);
    g.ids.push(s.id);
    for (const o of s.owners) if (!g.owners.includes(o)) g.owners.push(o);
    if (!g.where.includes(s.where)) g.where.push(s.where);
    map.set(s.key, g);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "tr"));
}
type Member = { id: string; name: string };

const fmt = (n: bigint) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** pick sold items and the members who share their money equally */
export function SaleDistributeForm({
  action,
  sales,
  members,
  collectorName,
}: {
  action: (form: FormData) => void | Promise<void>;
  sales: Sale[];
  members: Member[];
  collectorName: string;
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(sales.map((s) => s.id)));
  const ownersOf = (ids: Set<string>) => new Set(sales.filter((s) => ids.has(s.id)).flatMap((s) => s.owners));
  const [people, setPeople] = useState<Set<string>>(() => ownersOf(new Set(sales.map((s) => s.id))));
  const total = useMemo(() => sales.filter((s) => picked.has(s.id)).reduce((a, s) => a + BigInt(s.price), 0n), [sales, picked]);
  const per = people.size ? total / BigInt(people.size) : 0n;
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const groups = useMemo(() => groupSales(sales), [sales]);
  // members with a share in a sold item come first, then everyone else
  const owners = [...new Set(sales.flatMap((s) => s.owners))];
  const listed = [...owners.map((id) => ({ id, name: nameOf.get(id) ?? "?" })), ...members.filter((m) => !owners.includes(m.id))];
  const [showAll, setShowAll] = useState(false);

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  return (
    <form action={action} className="space-y-4">
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-mute uppercase">1. Dağıtılacak satışlar</h3>
          <span className="flex gap-2 text-xs">
            <button type="button" className="text-gold" onClick={() => setPicked(new Set(sales.map((s) => s.id)))}>Hepsi</button>
            <button type="button" className="text-mute" onClick={() => setPicked(new Set())}>Hiçbiri</button>
          </span>
        </div>
        <ul className="divide-y divide-line text-sm">
          {groups.map((g) => {
            const on = g.ids.every((id) => picked.has(id));
            return (
              <li key={g.key} className="flex items-start gap-3 py-2">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => {
                    const next = new Set(picked);
                    for (const id of g.ids) if (on) next.delete(id); else next.add(id);
                    setPicked(next);
                  }}
                  className="mt-1 h-4 w-4 accent-gold"
                  aria-label={`${g.label} dağıtıma dahil`}
                />
                {on && g.ids.map((id) => <input key={id} type="hidden" name="sel" value={id} />)}
                <span className="flex-1">
                  <b>{g.label}</b> <span className="text-gold">{g.qty} Adet</span>
                  <span className="text-mute"> · {g.where.join(", ")}</span>
                  <div className="text-xs text-mute">Pay sahipleri: {g.owners.map((id) => nameOf.get(id) ?? "?").join(", ") || "-"}</div>
                </span>
                <span className="whitespace-nowrap text-green-300">{fmt(g.price)}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-line pt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-mute uppercase">2. Dağıtılacak kişiler ({people.size})</h3>
          <span className="flex gap-2 text-xs">
            <button type="button" className="text-gold" onClick={() => setPeople(ownersOf(picked))}>Seçili satışların pay sahipleri</button>
            <button type="button" className="text-mute" onClick={() => setPeople(new Set())}>Hiçbiri</button>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-3">
          {(showAll ? listed : listed.slice(0, owners.length)).map((m) => (
            <label key={m.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="memberIds"
                value={m.id}
                checked={people.has(m.id)}
                onChange={() => setPeople(toggle(people, m.id))}
                className="accent-gold"
              />
              {m.name}
            </label>
          ))}
        </div>
        {listed.length > owners.length && (
          <button type="button" className="mt-2 text-xs text-gold" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Sadece pay sahiplerini göster" : `Diğer üyeleri de göster (${listed.length - owners.length})`}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <div className="text-sm">
          Toplam <b className="text-gold">{fmt(total)}</b> Noah, {people.size} kişiye eşit:{" "}
          <b className="text-gold">kişi başı {fmt(per)}</b>
          <div className="text-xs text-mute">Ödemeleri {collectorName} hesabı yapar; kayıt gün sonu hesapları altında görünür.</div>
        </div>
        <SubmitButton confirm={`${fmt(total)} Noah ${people.size} kişiye eşit dağıtılsın mı?`}>Ortak dağıt</SubmitButton>
      </div>
    </form>
  );
}
