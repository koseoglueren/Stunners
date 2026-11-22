import { prisma } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth";
import { categoryLabel, noah, noahShort } from "@/lib/format";
import type { SearchParams } from "@/lib/forms";
import { PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { ActionMenu, SubmitButton } from "@/components/client";
import { createItem, deleteItem, updateItem } from "./actions";

export const metadata = { title: "Item kataloğu" };

export default async function ItemsPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireUser();
  const sp = await searchParams;
  const canEdit = hasRole(me, "OFFICER");
  const [items, drops, sales] = await Promise.all([
    prisma.itemCatalog.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }),
    prisma.lootEntry.groupBy({ by: ["itemId"], where: { itemId: { not: null } }, _sum: { quantity: true } }),
    prisma.lootEntry.findMany({
      where: { status: "SOLD", itemId: { not: null } },
      select: { itemId: true, salePrice: true, quantity: true },
      orderBy: { soldAt: "desc" },
    }),
  ]);
  const dropMap = new Map(drops.map((d) => [d.itemId, d._sum.quantity ?? 0]));
  const recent = new Map<string, bigint[]>();
  for (const s of sales) {
    const arr = recent.get(s.itemId!) ?? [];
    if (arr.length < 5 && s.salePrice) arr.push(s.salePrice / BigInt(Math.max(1, s.quantity)));
    recent.set(s.itemId!, arr);
  }
  const cats = Object.entries(categoryLabel).filter(([k]) => k !== "COIN");

  return (
    <>
      <PageHeader title="Item kataloğu" subtitle="Loot girerken listeden seçilen itemler ve varsayılan piyasa fiyatları. Son satışların ortalaması fiyat güncellemek için yol gösterir." />
      <Flash sp={sp} />
      {canEdit && (
        <form action={createItem} className="card mb-6 grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="label">Item adı</label>
            <input name="name" className="input" required placeholder="örn. Blessed Upgrade Scroll" />
          </div>
          <div>
            <label className="label">Kategori</label>
            <select name="category" className="input">
              {cats.map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Piyasa fiyatı (adet)</label>
            <div className="flex gap-2">
              <input name="price" className="input" placeholder="örn. 5m" />
              <SubmitButton>Ekle</SubmitButton>
            </div>
          </div>
        </form>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        {cats.map(([cat, label]) => {
          const list = items.filter((i) => i.category === cat);
          if (!list.length) return null;
          return (
            <div key={cat} className="card overflow-x-auto p-0">
              <h2 className="px-5 pt-5 font-semibold text-gold">{label}</h2>
              <table className="table mt-2">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="text-right">Düşen</th>
                    <th className="text-right">Son satış ort.</th>
                    <th className="text-right">Fiyat</th>
                    {canEdit && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {list.map((i) => {
                    const r = recent.get(i.id) ?? [];
                    const avg = r.length ? r.reduce((a, b) => a + b, 0n) / BigInt(r.length) : null;
                    return (
                      <tr key={i.id} className={i.active ? "" : "opacity-50"}>
                        <td>{i.name}</td>
                        <td className="text-right">{dropMap.get(i.id) ?? 0}</td>
                        <td className="text-right text-mute">{avg !== null ? `${noahShort(avg)} (${r.length})` : "-"}</td>
                        <td className="text-right whitespace-nowrap">
                          {noah(i.defaultPrice)}
                          {!i.active && <div className="text-xs text-mute">pasif</div>}
                        </td>
                        {canEdit && (
                          <td className="text-right">
                            <ActionMenu title={i.name} label="Düzenle">
                              <form action={updateItem.bind(null, i.id)} className="space-y-3">
                                <div>
                                  <label className="label">Item adı</label>
                                  <input name="name" className="input" defaultValue={i.name} required />
                                </div>
                                <div>
                                  <label className="label">Kategori</label>
                                  <select name="category" className="input" defaultValue={i.category}>
                                    {cats.map(([k, v]) => (
                                      <option key={k} value={k}>{v}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="label">Piyasa fiyatı (adet)</label>
                                  <input name="price" className="input" defaultValue={noah(i.defaultPrice)} />
                                </div>
                                <label className="flex items-center gap-2 text-sm">
                                  <input type="checkbox" name="active" defaultChecked={i.active} className="accent-gold" /> Loot girerken listede göster
                                </label>
                                <SubmitButton className="btn-primary w-full">Kaydet</SubmitButton>
                              </form>
                              <form action={deleteItem.bind(null, i.id)} className="border-t border-line pt-3">
                                <SubmitButton className="btn-danger btn-sm w-full" confirm={`${i.name} katalogdan silinsin mi? Eski farm kayıtları adıyla kalır.`}>
                                  Katalogdan sil
                                </SubmitButton>
                              </form>
                            </ActionMenu>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </>
  );
}
