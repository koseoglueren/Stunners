"use client";

import { useMemo, useState } from "react";
import { DateTimeInput, SubmitButton, NoahInput } from "@/components/client";

type Item = { id: string; name: string; category: string; price: string };
type Member = { id: string; name: string };

const CATS: [string, string][] = [
  ["COIN", "Coin (Noah)"],
  ["SCROLL", "Upgrade Scroll"],
  ["WEAPON", "Weapon"],
  ["ARMOR", "Armor"],
  ["MATERIAL", "Taş / Malzeme"],
  ["OTHER", "Diğer"],
];

/** categories where a +level makes sense */
export function hasLevel(cat: string) {
  return cat === "WEAPON" || cat === "ARMOR" || cat === "OTHER";
}

export function PlusSelect({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <div>
      <label className="label">+ Seviye</label>
      <select name="plusLevel" className="input" defaultValue={defaultValue}>
        <option value="">Yok</option>
        {Array.from({ length: 16 }, (_, i) => (
          <option key={i} value={i}>+{i}</option>
        ))}
      </select>
    </div>
  );
}

function fmt(n: bigint) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function LootForm({
  action,
  items,
  members,
  defaultHolder,
  coinDone = [],
}: {
  action: (form: FormData) => void;
  items: Item[];
  members: Member[];
  defaultHolder: string;
  /** members who already handed in their coin for this farm (hidden from the coin list) */
  coinDone?: string[];
}) {
  const [cat, setCat] = useState("COIN");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState(1);
  const list = useMemo(() => items.filter((i) => i.category === cat), [items, cat]);
  const item = list.find((i) => i.id === itemId);
  const suggested = item ? BigInt(item.price) * BigInt(qty || 1) : null;
  const isCoin = cat === "COIN";
  const coinLeft = members.filter((m) => !coinDone.includes(m.id));
  const holders = isCoin && coinLeft.length ? coinLeft : members;
  const holderDefault = isCoin ? (holders[0]?.id ?? "") : defaultHolder;

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <div className={isCoin ? "lg:col-span-2" : ""}>
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
      {!isCoin && (
        <>
          <div className="lg:col-span-2">
            <label className="label">Item</label>
            <select name="itemId" className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">Listede yok, adını yaz</option>
              {list.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
            {!itemId && <input name="itemName" className="input mt-2" placeholder="Item adı" />}
          </div>
          <div>
            <label className="label">Adet</label>
            <input name="quantity" type="number" min={1} className="input" value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 1)} />
          </div>
          {hasLevel(cat) && <PlusSelect />}
        </>
      )}
      <div className={isCoin ? "lg:col-span-2" : ""}>
        <label className="label">{isCoin ? "Miktar (Noah)" : "Tahmini değer"}</label>
        <NoahInput
          name="value"
          className="input"
          placeholder={isCoin ? "örn. 150m veya 150.000.000" : suggested !== null ? `${fmt(suggested)} (katalog)` : "örn. 40m"}
          required={isCoin}
        />
      </div>
      <div className={isCoin ? "lg:col-span-2" : ""}>
        <label className="label">{isCoin ? "Coin kimde" : "Item kimde"}</label>
        <select key={`${cat}-${holders.length}`} name="holderId" className="input" defaultValue={holderDefault}>
          {holders.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        {isCoin && coinDone.length > 0 && (
          <p className="mt-1 text-xs text-mute">
            {coinLeft.length ? `Coin girilmeyen: ${coinLeft.length} kişi` : "Herkesin coini girildi."}
          </p>
        )}
      </div>
      <div className={isCoin ? "sm:col-span-2 lg:col-span-5" : "sm:col-span-2 lg:col-span-3"}>
        <label className="label">Not (isteğe bağlı)</label>
        <input name="note" className="input" placeholder="örn. boss drop" />
      </div>
      {!isCoin && (
        <div className="sm:col-span-2 lg:col-span-2">
          <label className="label">Düştüğü saat (boş = şimdi)</label>
          <DateTimeInput name="droppedAt" />
          <p className="mt-1 text-xs text-mute">Pay sahipleri, item düştüğü anda partide olanlardır.</p>
        </div>
      )}
      {!isCoin && (
        <label className="flex items-end gap-2 pb-2 text-sm sm:col-span-2 lg:col-span-4">
          <input type="checkbox" name="vault" defaultChecked className="h-4 w-4 accent-gold" />
          <span>Pazarda satılacak, clan kasasına ekle</span>
        </label>
      )}
      <div className="flex items-end">
        <SubmitButton className="btn-primary w-full">+ Kaydet</SubmitButton>
      </div>
    </form>
  );
}
