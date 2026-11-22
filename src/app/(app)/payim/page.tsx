import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth";
import { noah, noahShort } from "@/lib/format";
import { first, type SearchParams } from "@/lib/forms";
import { allocate, lootContribution } from "@/lib/settlement";
import { itemOwners, lootBeneficiaries } from "@/lib/shares";
import { Badge, Empty, PageHeader, Stat } from "@/components/ui";
import { LocalTime } from "@/components/client";

export const metadata = { title: "Payım" };

export default async function MySharePage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireUser();
  const sp = await searchParams;
  const asked = first(sp.uye);
  const userId = asked && hasRole(me, "OFFICER") ? asked : me.id;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) notFound();
  const self = userId === me.id;

  const [shares, openSessions, vaultItems] = await Promise.all([
    prisma.settlementShare.findMany({
      where: { userId },
      include: {
        settlement: {
          include: {
            collector: true,
            sessions: { include: { session: { include: { location: true } } } },
            transfers: { where: { OR: [{ toId: userId, kind: "PAYOUT" }, { fromId: userId, kind: "DELIVERY" }] } },
          },
        },
      },
      orderBy: { settlement: { createdAt: "desc" } },
    }),
    prisma.farmSession.findMany({
      where: { members: { some: { userId } }, loot: { some: { settlementId: null, status: { in: ["COIN", "SOLD", "GIVEN"] } } } },
      include: { location: true, members: true, loot: { where: { settlementId: null }, include: { owners: true } } },
      orderBy: { startAt: "desc" },
    }),
    prisma.lootEntry.findMany({
      where: { status: "IN_STOCK", inVault: true },
      include: { owners: true, session: { include: { members: true, location: true } } },
    }),
  ]);

  const rows = shares
    .filter((s) => s.share > 0n || s.settlement.transfers.length)
    .map((s) => {
      const payout = s.settlement.transfers.find((t) => t.kind === "PAYOUT");
      const delivery = s.settlement.transfers.find((t) => t.kind === "DELIVERY");
      const isCollector = s.settlement.collectorId === userId;
      return { s, payout, delivery, isCollector };
    });
  const pending = rows.reduce((a, r) => a + (r.payout && r.payout.status !== "RECEIVED" ? r.payout.amount : 0n), 0n);
  const paid = rows.reduce((a, r) => a + (r.payout?.status === "RECEIVED" ? r.payout.amount : 0n), 0n);
  const toDeliver = rows.reduce((a, r) => a + (r.delivery && r.delivery.status !== "RECEIVED" ? r.delivery.amount : 0n), 0n);

  const estimates = openSessions
    .map((s) => {
      let mine = 0n;
      for (const l of s.loot) {
        const c = lootContribution(l);
        if (!c) continue;
        mine += allocate(c.amount, lootBeneficiaries(l, s)).get(userId) ?? 0n;
      }
      return { s, mine };
    })
    .filter((e) => e.mine > 0n);
  const estTotal = estimates.reduce((a, e) => a + e.mine, 0n);

  const myItems = vaultItems.filter((l) => itemOwners(l, l.session).includes(userId));
  const itemEst = myItems.reduce((a, l) => a + l.value / BigInt(Math.max(1, itemOwners(l, l.session).length)), 0n);

  return (
    <>
      <PageHeader
        title={self ? "Payım" : `${user.characterName} payı`}
        subtitle="Hangi farm gününden ne kadar alacağın, kasa hesabının sana ödeyip ödemediği ve kasadaki hangi itemlerde payın olduğu."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Kasadan alacağın" value={noahShort(pending)} hint={`${noah(pending)} Noah`} accent />
        <Stat label="Bugüne kadar ödenen" value={noahShort(paid)} />
        <Stat label="Hesabı yapılmamış farmlar" value={noahShort(estTotal)} hint="tahmini" />
        <Stat label="Kasadaki item payın" value={noahShort(itemEst)} hint={<Link href="/vault?benim=1" className="text-gold">{myItems.length} item →</Link>} />
      </div>
      {toDeliver > 0n && (
        <div className="card mb-6 border-warn/40 text-sm">
          Kasa hesabına teslim etmen gereken: <b className="text-orange-300">{noah(toDeliver)} Noah</b>
        </div>
      )}

      <div className="card mb-6 p-0">
        <h2 className="px-5 pt-5 font-semibold">Farm günleri</h2>
        {rows.length === 0 ? (
          <div className="p-5"><Empty>Henüz hesabı yapılmış farm yok.</Empty></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table mt-2">
              <thead>
                <tr>
                  <th>Gün / hesap</th>
                  <th>Farmlar</th>
                  <th className="text-right">Payı</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ s, payout, delivery, isCollector }) => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/settlements/${s.settlementId}`} className="font-medium hover:text-gold">{s.settlement.title}</Link>
                      <div className="text-xs text-mute"><LocalTime value={s.settlement.lockedAt ?? s.settlement.createdAt} /></div>
                    </td>
                    <td className="text-sm">
                      {s.settlement.sessions.map((x) => (
                        <div key={x.sessionId}>
                          <Link href={`/farms/${x.sessionId}`} className="hover:text-gold">{x.session.location.name}{x.session.title ? ` · ${x.session.title}` : ""}</Link>
                        </div>
                      ))}
                    </td>
                    <td className="text-right text-gold">{noah(s.share)}</td>
                    <td className="text-sm">
                      {isCollector ? (
                        <Badge tone="gold">Kasa sende</Badge>
                      ) : payout ? (
                        payout.status === "RECEIVED" ? <Badge tone="green">Ödendi</Badge> : <Badge tone="orange">Alacaklı</Badge>
                      ) : (
                        <span className="text-mute">-</span>
                      )}
                      {delivery && (
                        <div className="mt-1 text-xs text-mute">
                          Teslim: {noah(delivery.amount)} · {delivery.status === "RECEIVED" ? "teslim edildi" : "bekliyor"}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {estimates.length > 0 && (
        <div className="card p-0">
          <h2 className="px-5 pt-5 font-semibold">Hesabı yapılmamış farmlar (tahmini)</h2>
          <table className="table mt-2">
            <tbody>
              {estimates.map(({ s, mine }) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/farms/${s.id}`} className="hover:text-gold">{s.location.name}{s.title ? ` · ${s.title}` : ""}</Link>{" "}
                    <span className="text-xs text-mute"><LocalTime value={s.startAt} mode="date" /></span>
                  </td>
                  <td className="text-right text-gold">~{noah(mine)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
