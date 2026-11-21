import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { categoryLabel, hoursBetween, noah, noahShort } from "@/lib/format";
import { first, type SearchParams } from "@/lib/forms";
import { lootContribution } from "@/lib/settlement";
import { Empty, PageHeader, Stat } from "@/components/ui";

export const metadata = { title: "Raporlar" };

function parseDay(v: string | undefined, fallback: Date) {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return fallback;
  return new Date(`${v}T00:00:00+03:00`);
}
const ymd = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser();
  const sp = await searchParams;
  const from = parseDay(first(sp.bas), new Date(Date.now() - 30 * 86_400_000));
  const toDay = parseDay(first(sp.bit), new Date());
  const to = new Date(new Date(`${ymd(toDay)}T00:00:00+03:00`).getTime() + 86_400_000);

  const sessions = await prisma.farmSession.findMany({
    where: { startAt: { gte: from, lt: to } },
    include: { location: true, members: { include: { user: true } }, loot: true },
  });

  let total = 0n;
  let hoursAll = 0;
  const byLoc = new Map<string, { name: string; count: number; hours: number; total: bigint; manHours: number }>();
  const byMember = new Map<string, { name: string; count: number; hours: number; estShare: bigint }>();
  const byItem = new Map<string, { name: string; cat: string; qty: number; sold: bigint; stock: number }>();

  for (const s of sessions) {
    const h = hoursBetween(s.startAt, s.endAt);
    const earned = s.loot.reduce((a, l) => a + (lootContribution(l)?.amount ?? 0n), 0n);
    total += earned;
    hoursAll += h;
    const loc = byLoc.get(s.locationId) ?? { name: s.location.name, count: 0, hours: 0, total: 0n, manHours: 0 };
    loc.count++;
    loc.hours += h;
    loc.total += earned;
    loc.manHours += h * s.members.length;
    byLoc.set(s.locationId, loc);
    const n = BigInt(Math.max(1, s.members.length));
    for (const m of s.members) {
      const r = byMember.get(m.userId) ?? { name: m.user.characterName, count: 0, hours: 0, estShare: 0n };
      r.count++;
      r.hours += h;
      r.estShare += earned / n;
      byMember.set(m.userId, r);
    }
    for (const l of s.loot) {
      if (l.status === "COIN") continue;
      const key = l.itemName + (l.plusLevel !== null ? ` +${l.plusLevel}` : "");
      const it = byItem.get(key) ?? { name: key, cat: categoryLabel[l.category], qty: 0, sold: 0n, stock: 0 };
      it.qty += l.quantity;
      if (l.status === "SOLD") it.sold += l.salePrice ?? 0n;
      if (l.status === "IN_STOCK") it.stock += l.quantity;
      byItem.set(key, it);
    }
  }
  const locs = [...byLoc.values()].sort((a, b) => Number(b.total) / Math.max(b.hours, 0.01) - Number(a.total) / Math.max(a.hours, 0.01));
  const members = [...byMember.values()].sort((a, b) => (b.estShare > a.estShare ? 1 : -1));
  const itemsList = [...byItem.values()].sort((a, b) => b.qty - a.qty);

  return (
    <>
      <PageHeader title="Raporlar" subtitle="Seçilen tarih aralığında başlayan farmlar. Kazanç = coin + satılan itemler + üyeye verilen item değerleri." />
      <form className="card mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Başlangıç</label>
          <input type="date" name="bas" className="input" defaultValue={ymd(from)} />
        </div>
        <div>
          <label className="label">Bitiş</label>
          <input type="date" name="bit" className="input" defaultValue={ymd(toDay)} />
        </div>
        <button className="btn-primary">Göster</button>
      </form>
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Toplam kazanç" value={noahShort(total)} hint={`${noah(total)} Noah`} accent />
        <Stat label="Farm sayısı" value={sessions.length} />
        <Stat label="Toplam farm saati" value={hoursAll.toFixed(1)} />
        <Stat label="Saatlik ortalama" value={hoursAll > 0 ? noahShort(Number(total) / hoursAll) : "-"} />
      </div>
      {sessions.length === 0 ? (
        <Empty>Bu aralıkta farm yok.</Empty>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="card overflow-x-auto p-0">
            <h2 className="px-5 pt-5 font-semibold">Farm yeri verimi</h2>
            <table className="table mt-2">
              <thead>
                <tr><th>Yer</th><th className="text-right">Farm</th><th className="text-right">Saat</th><th className="text-right">Kazanç</th><th className="text-right">Saatlik</th><th className="text-right">Kişi/saat</th></tr>
              </thead>
              <tbody>
                {locs.map((l) => (
                  <tr key={l.name}>
                    <td>{l.name}</td>
                    <td className="text-right">{l.count}</td>
                    <td className="text-right">{l.hours.toFixed(1)}</td>
                    <td className="text-right text-gold">{noahShort(l.total)}</td>
                    <td className="text-right">{l.hours > 0 ? noahShort(Number(l.total) / l.hours) : "-"}</td>
                    <td className="text-right">{l.manHours > 0 ? noahShort(Number(l.total) / l.manHours) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card overflow-x-auto p-0">
            <h2 className="px-5 pt-5 font-semibold">Üye katılımı</h2>
            <table className="table mt-2">
              <thead>
                <tr><th>Üye</th><th className="text-right">Farm</th><th className="text-right">Saat</th><th className="text-right">Tahmini pay</th></tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.name}>
                    <td>{m.name}</td>
                    <td className="text-right">{m.count}</td>
                    <td className="text-right">{m.hours.toFixed(1)}</td>
                    <td className="text-right text-gold">{noahShort(m.estShare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-5 pb-4 text-xs text-mute">Tahmini pay her farmın kendi ekibine eşit bölünmüş halidir; birleştirilmiş gün sonu hesaplarında gerçek pay farklı olabilir.</p>
          </div>
          <div className="card overflow-x-auto p-0 xl:col-span-2">
            <h2 className="px-5 pt-5 font-semibold">Düşen itemler</h2>
            <table className="table mt-2">
              <thead>
                <tr><th>Item</th><th>Kategori</th><th className="text-right">Adet</th><th className="text-right">Satılmayan</th><th className="text-right">Satış geliri</th></tr>
              </thead>
              <tbody>
                {itemsList.map((i) => (
                  <tr key={i.name}>
                    <td>{i.name}</td>
                    <td className="text-mute">{i.cat}</td>
                    <td className="text-right">{i.qty}</td>
                    <td className="text-right">{i.stock || "-"}</td>
                    <td className="text-right">{i.sold > 0n ? noahShort(i.sold) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
