"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/client";
import { PlusSelect, hasLevel } from "./LootForm";

type Item = { id: string; name: string; category: string; price: string };
type Member = { id: string; name: string; done: boolean };

const CATS: [string, string][] = [
  ["SCROLL", "Upgrade Scroll"],
  ["WEAPON", "Weapon"],
  ["ARMOR", "Armor"],
  ["MATERIAL", "Taş / Malzeme"],
  ["OTHER", "Diğer"],
];

type Row = { key: number; cat: string; itemId: string };

function ItemRow({ row, items, onChange, onRemove }: { row: Row; items: Item[]; onChange: (r: Row) => void; onRemove: () => void }) {
  const list = items.filter((i) => i.category === row.cat);
  return (
    <div className="grid gap-2 rounded-lg border border-line bg-bg p-3 sm:grid-cols-12">
      <div className="sm:col-span-3">
        <label className="label">Tür</label>
        <select name="cat" className="input" value={row.cat} onChange={(e) => onChange({ ...row, cat: e.target.value, itemId: "" })}>
          {CATS.map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-4">
        <label className="label">Item</label>
        <select name="itemId" className="input" value={row.itemId} onChange={(e) => onChange({ ...row, itemId: e.target.value })}>
          <option value="">Listede yok, adını yaz</option>
          {list.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        {row.itemId ? <input type="hidden" name="itemName" value="" /> : <input name="itemName" className="input mt-2" placeholder="Item adı" />}
      </div>
      <div className="sm:col-span-1">
        <label className="label">Adet</label>
        <input name="qty" type="number" min={1} defaultValue={1} className="input" />
      </div>
      <div className="sm:col-span-2">
        {hasLevel(row.cat) ? <PlusSelect /> : <input type="hidden" name="plusLevel" value="" />}
      </div>
      <div className="sm:col-span-2">
        <label className="label">Değer</label>
        <div className="flex gap-1">
          <input name="ival" className="input" placeholder="katalog" />
          <button type="button" onClick={onRemove} className="btn-ghost btn-sm" aria-label="Satırı sil">✕</button>
        </div>
      </div>
    </div>
  );
}

/** pick a member, enter the coin and items received from them, save, move on to the next member */
export function CollectForm({
  action,
  members,
  items,
  defaultMember,
}: {
  action: (form: FormData) => void;
  members: Member[];
  items: Item[];
  defaultMember: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [next, setNext] = useState(1);
  const add = () => {
    setRows((r) => [...r, { key: next, cat: "SCROLL", itemId: "" }]);
    setNext((n) => n + 1);
  };
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Üye</label>
          <select key={defaultMember} name="memberId" className="input" defaultValue={defaultMember} required>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.done ? "✓ " : ""}
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Ondan alınan coin (Noah)</label>
          <input name="coin" className="input" placeholder="örn. 15m veya 15.000.000" />
        </div>
      </div>
      {rows.map((r) => (
        <ItemRow
          key={r.key}
          row={r}
          items={items}
          onChange={(nr) => setRows((all) => all.map((x) => (x.key === r.key ? nr : x)))}
          onRemove={() => setRows((all) => all.filter((x) => x.key !== r.key))}
        />
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={add} className="btn-ghost btn-sm">+ Item ekle</button>
        {rows.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="vault" defaultChecked className="h-4 w-4 accent-gold" />
            Itemler pazarda satılacak, clan kasasına ekle
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <label className="label">Not (isteğe bağlı)</label>
          <input name="note" className="input" />
        </div>
        <SubmitButton>Kaydet, sıradaki üyeye geç</SubmitButton>
      </div>
    </form>
  );
}
