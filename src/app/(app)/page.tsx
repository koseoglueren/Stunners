import Link from "next/link";
import { prisma } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth";
import { categoryLabel, durationText, noah, noahShort } from "@/lib/format";
import { first, type SearchParams } from "@/lib/forms";
import { lootContribution } from "@/lib/settlement";
import { Alert, Empty, PageHeader, Stat } from "@/components/ui";
import { LocalTime } from "@/components/client";

export default async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireUser();
  const sp = await searchParams;
  const since14 = new Date(Date.now() - 14 * 86_400_000);
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const [active, loot14, myShares, owe, owed, recentDrops, top, stock] = await Promise.all([
    prisma.farmSession.findMany({ where: { status: "ACTIVE" }, include: { location: true, _count: { select: { members: true } } }, orderBy: { startAt: "desc" } }),
    prisma.lootEntry.findMany({ where: { session: { startAt: { gte: since14 } } }, include: { session: true } }),
    prisma.settlementShare.aggregate({ where: { userId: me.id }, _sum: { share: true } }),
    prisma.transfer.aggregate({ where: { fromId: me.id, status: "PENDING" }, _sum: { amount: true } }),
    prisma.transfer.aggregate({ where: { toId: me.id, status: { not: "RECEIVED" } }, _sum: { amount: true } }),
    prisma.lootEntry.findMany({
      where: { status: { not: "COIN" } },
      include: { holder: true, handedOverBy: true, soldBy: true, receiver: true, session: { include: { location: true } } },
      orderBy: { droppedAt: "desc" },
      take: 10,
    }),
    prisma.settlementShare.groupBy({ by: ["userId"], where: { settlement: { createdAt: { gte: since30 } } }, _sum: { share: true }, orderBy: { _sum: { share: "desc" } }, take: 5 }),
    prisma.lootEntry.aggregate({ where: { status: "IN_STOCK", inVault: true }, _sum: { value: true }, _count: true }),
  ]);
  const topUsers = await prisma.user.findMany({ where: { id: { in: top.map((t) => t.userId) } } });
  const nameOf = new Map(topUsers.map((u) => [u.id, u.characterName]));

  // daily earnings, last 14 days, by session start day (viewer-independent: Istanbul day)
  const dayKey = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
  const days: { key: string; label: string; total: bigint }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    days.push({ key: dayKey(d), label: d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Istanbul" }), total: 0n });
  }
  for (const l of loot14) {
    const c = lootContribution(l);
    const day = days.find((x) => x.key === dayKey(l.session!.startAt));
    if (c && day) day.total += c.amount;
  }
  const week = days.slice(-7).reduce((a, d) => a + d.total, 0n);
  const max = days.reduce((a, d) => (d.total > a ? d.total : a), 1n);

  return (
    <>
      <PageHeader title={`Hoş geldin, ${me.characterName}`} subtitle="STUNNERS clan farm özeti" actions={hasRole(me, "OFFICER") && <Link href="/farms/new" className="btn-primary">+ Yeni farm</Link>} />
      {first(sp.yetki) === "yok" && <Alert>Bu sayfa için yetkin yok.</Alert>}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Son 7 gün clan kazancı" value={noahShort(week)} hint={`${noah(week)} Noah`} accent />
        <Stat label="Toplam kazancın" value={noahShort(myShares._sum.share ?? 0n)} hint="kilitlenen hesaplardan" />
        <Stat label="Vermen gereken" value={noahShort(owe._sum.amount ?? 0n)} hint={<Link href="/transfers" className="text-gold">Ödemeler →</Link>} />
        <Stat label="Alacağın" value={noahShort(owed._sum.amount ?? 0n)} hint={<Link href="/vault" className="text-gold">Clan kasası: {noahShort(stock._sum.value ?? 0n)} ({stock._count} item) →</Link>} />
      </div>

      {active.length > 0 && (
        <div className="card mb-6 border-good/40">
          <h2 className="mb-2 font-semibold text-green-300">Devam eden farmlar</h2>
          <ul className="space-y-1 text-sm">
            {active.map((s) => (
              <li key={s.id} className="flex justify-between">
                <Link href={`/farms/${s.id}`} className="hover:text-gold">{s.location.name}{s.title ? ` · ${s.title}` : ""}</Link>
                <span className="text-mute">{s._count.members} kişi · {durationText(s.startAt, null)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="card xl:col-span-2">
          <h2 className="mb-4 font-semibold">Günlük kazanç (son 14 gün)</h2>
          <div className="flex h-48 items-end gap-1.5">
            {days.map((d) => (
              <div key={d.key} className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] text-mute opacity-0 group-hover:opacity-100">{noahShort(d.total)}</span>
                <div
                  className="w-full rounded-t bg-gradient-to-t from-gold/50 to-gold"
                  style={{ height: `${Math.max(2, Number((d.total * 100n) / max))}%`, opacity: d.total === 0n ? 0.2 : 1 }}
                  title={`${d.label}: ${noah(d.total)} Noah`}
                />
                <span className="text-[10px] text-mute">{d.label.slice(0, 2)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h2 className="mb-3 font-semibold">Son 30 gün en çok kazananlar</h2>
          {top.length === 0 ? (
            <Empty>Henüz kilitlenmiş hesap yok.</Empty>
          ) : (
            <ol className="space-y-2 text-sm">
              {top.map((t, i) => (
                <li key={t.userId} className="flex justify-between">
                  <span><span className="mr-2 text-gold">{i + 1}.</span>{nameOf.get(t.userId)}</span>
                  <span>{noahShort(t._sum.share ?? 0n)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="card mt-6 overflow-x-auto p-0">
        <h2 className="px-5 pt-5 font-semibold">Son düşen itemler</h2>
        {recentDrops.length === 0 ? (
          <div className="p-5"><Empty>Henüz item düşmedi.</Empty></div>
        ) : (
          <table className="table mt-2">
            <thead>
              <tr>
                <th>Item adı</th>
                <th className="text-right">Adet</th>
                <th>Hangi farm</th>
                <th>Kime düştü</th>
                <th>Şu an kimde</th>
                <th className="text-right">Tarih</th>
              </tr>
            </thead>
            <tbody>
              {recentDrops.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.itemName}
                    {l.plusLevel !== null && <span className="text-gold"> +{l.plusLevel}</span>}
                    <div className="text-xs text-mute">{categoryLabel[l.category]}</div>
                  </td>
                  <td className="text-right">{l.quantity}</td>
                  <td>{l.session ? <Link href={`/farms/${l.sessionId}`} className="text-mute hover:text-gold">{l.session.location.name}</Link> : "-"}</td>
                  <td>{(l.handedOverBy ?? l.holder).characterName}</td>
                  <td>
                    {l.status === "SOLD" ? (
                      <span className="text-green-300">Satıldı ({l.soldBy?.characterName ?? l.holder.characterName})</span>
                    ) : l.status === "GIVEN" ? (
                      l.receiver?.characterName
                    ) : (
                      <>
                        {l.holder.characterName}
                        {l.inVault && <span className="text-xs text-orange-300"> · kasada</span>}
                      </>
                    )}
                  </td>
                  <td className="text-right text-mute"><LocalTime value={l.droppedAt} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
