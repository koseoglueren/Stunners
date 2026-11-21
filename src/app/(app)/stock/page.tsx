import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { categoryLabel, noah, noahShort } from "@/lib/format";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { LocalTime } from "@/components/client";

export const metadata = { title: "Satılmayan itemler" };

export default async function StockPage() {
  await requireUser();
  const items = await prisma.lootEntry.findMany({
    where: { status: "IN_STOCK" },
    include: { holder: true, session: { include: { location: true } } },
    orderBy: { droppedAt: "desc" },
  });
  const total = items.reduce((a, l) => a + l.value, 0n);
  const byHolder = new Map<string, { name: string; count: number; value: bigint }>();
  for (const l of items) {
    const h = byHolder.get(l.holderId) ?? { name: l.holder.characterName, count: 0, value: 0n };
    h.count += l.quantity;
    h.value += l.value;
    byHolder.set(l.holderId, h);
  }
  return (
    <>
      <PageHeader title="Satılmayan itemler" subtitle="Farmlardan düşen ama henüz satılmamış veya üyeye verilmemiş itemler. Satmak için farm sayfasındaki İşlem menüsünü kullan." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Toplam tahmini değer" value={noahShort(total)} hint={`${noah(total)} Noah`} accent />
        <Stat label="Kayıt" value={items.length} />
        <Stat label="Item tutan üye" value={byHolder.size} />
      </div>
      {items.length === 0 ? (
        <Empty>Satılmayı bekleyen item yok.</Empty>
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="card overflow-x-auto p-0 xl:col-span-2">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Kimde</th>
                  <th>Farm</th>
                  <th className="text-right">Tahmini</th>
                </tr>
              </thead>
              <tbody>
                {items.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {l.itemName}
                      {l.plusLevel !== null && <span className="text-gold"> +{l.plusLevel}</span>}
                      {l.quantity > 1 && <span className="text-mute"> ×{l.quantity}</span>}
                      <div className="text-xs text-mute">{categoryLabel[l.category]}</div>
                    </td>
                    <td>{l.holder.characterName}</td>
                    <td><Link href={`/farms/${l.sessionId}#loot`} className="hover:text-gold">{l.session.location.name}</Link> <span className="text-xs text-mute"><LocalTime value={l.droppedAt} mode="date" /></span></td>
                    <td className="text-right">{noah(l.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2 className="mb-2 font-semibold">Kimde ne kadar</h2>
            <ul className="space-y-1 text-sm">
              {[...byHolder.values()].sort((a, b) => (b.value > a.value ? 1 : -1)).map((h) => (
                <li key={h.name} className="flex justify-between"><span>{h.name} <span className="text-mute">({h.count})</span></span><span>{noahShort(h.value)}</span></li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
