"use client";

import { useMemo, useState } from "react";
import { SubmitButton, NoahInput } from "@/components/client";
import { PlusSelect, hasLevel } from "../farms/LootForm";

type Item = { id: string; name: string; category: string; price: string };
type Opt = { id: string; name: string };

const CATS: [string, string][] = [
  ["WEAPON", "Weapon"],
  ["ARMOR", "Armor"],
  ["SCROLL", "Upgrade Scroll"],
  ["MATERIAL", "Taş / Malzeme"],
  ["OTHER", "Diğer (takı vb.)"],
];

function fmt(n: bigint) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function VaultForm({
  action,
  items,
  members,
  farms,
  defaultHolder,
}: {
  action: (form: FormData) => void;
  items: Item[];
  members: Opt[];
  farms: Opt[];
  defaultHolder: string;
}) {
  const [cat, setCat] = useState("WEAPON");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState(1);
  const [farm, setFarm] = useState("");
  const list = useMemo(() => items.filter((i) => i.category === cat), [items, cat]);
  const item = list.find((i) => i.id === itemId);
  const suggested = item ? BigInt(item.price) * BigInt(qty || 1) : null;

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label">Tür</label>
        <select
          name="category"
          className="input"
          value={cat}
          onChange={(e) => {
            setCat(e.target.value);
            setItemId("");
          }}
        >
          {CATS.map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Item</label>
        <select name="itemId" className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
          <option value="">Listede yok, adını yaz</option>
          {list.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        {!itemId && <input name="itemName" className="input mt-2" placeholder="Item adı" required />}
      </div>
      {hasLevel(cat) ? <PlusSelect /> : <div className="hidden sm:block" />}
      <div>
        <label className="label">Adet</label>
        <input name="quantity" type="number" min={1} className="input" value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 1)} />
      </div>
      <div>
        <label className="label">Tahmini değer</label>
        <NoahInput name="value" className="input" placeholder={suggested !== null ? `${fmt(suggested)} (katalog)` : "örn. 40m"} />
      </div>
      <div>
        <label className="label">Hangi hesapta</label>
        <select name="holderId" className="input" defaultValue={defaultHolder}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">Hangi farmdan? (pay sahipleri o farmın ekibi olur)</label>
        <select name="sessionId" className="input" value={farm} onChange={(e) => setFarm(e.target.value)} required>
          <option value="" disabled>Farm seç</option>
          {farms.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-mute">Pay sahiplerini ekledikten sonra İşlem menüsünden değiştirebilirsin.</p>
      </div>
      <div className="sm:col-span-2">
        <label className="label">Not (isteğe bağlı)</label>
        <input name="note" className="input" placeholder="örn. pazara 50m'den konuldu" />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton className="btn-primary w-full">+ Clan kasasına ekle</SubmitButton>
      </div>
    </form>
  );
}
