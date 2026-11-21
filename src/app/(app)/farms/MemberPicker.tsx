"use client";

import { useState } from "react";

type M = { id: string; name: string; cls?: string | null };

export function MemberPicker({ members, selected = [] }: { members: M[]; selected?: string[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set(selected));
  const [q, setQ] = useState("");
  const shown = members.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" placeholder="Üye ara" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn-ghost btn-sm" onClick={() => setSel(new Set(members.map((m) => m.id)))}>Hepsini seç</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setSel(new Set())}>Temizle</button>
        <span className="text-sm text-gold">{sel.size} kişi seçili</span>
      </div>
      <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((m) => (
          <label
            key={m.id}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              sel.has(m.id) ? "border-gold/60 bg-gold/10" : "border-line bg-bg hover:border-line"
            }`}
          >
            <input type="checkbox" className="accent-[#d4a64a]" checked={sel.has(m.id)} onChange={() => toggle(m.id)} />
            <span className="truncate">{m.name}</span>
            {m.cls && <span className="ml-auto text-xs text-mute">{m.cls}</span>}
          </label>
        ))}
      </div>
      {[...sel].map((id) => (
        <input key={id} type="hidden" name="memberIds" value={id} />
      ))}
    </div>
  );
}
