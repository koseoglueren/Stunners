import Link from "next/link";
import { prisma } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth";
import { noah, noahShort } from "@/lib/format";
import type { SearchParams } from "@/lib/forms";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { LocalTime } from "@/components/client";

export const metadata = { title: "Gün sonu hesapları" };

export default async function SettlementsPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireUser();
  const sp = await searchParams;
  const list = await prisma.settlement.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      sessions: { include: { session: { include: { location: true } } } },
      transfers: true,
      collector: true,
      _count: { select: { shares: true } },
    },
  });
  return (
    <>
      <PageHeader
        title="Gün sonu hesapları"
        subtitle="Kilitlenen her hesap, seçilen farmların kazancını katılımcılara eşit böler."
        actions={hasRole(me, "OFFICER") && <Link href="/settlements/new" className="btn-primary">+ Yeni hesap</Link>}
      />
      <Flash sp={sp} />
      {list.length === 0 ? (
        <Empty>Henüz hesap yok.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Hesap</th>
                <th>Tarih</th>
                <th>Farmlar</th>
                <th>Kasa hesabı</th>
                <th className="text-right">Toplam</th>
                <th className="text-right">Ortalama pay</th>
                <th>Ödemeler</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const open = s.transfers.filter((t) => t.status !== "RECEIVED").length;
                return (
                  <tr key={s.id} className="hover:bg-panel-2/60">
                    <td><Link href={`/settlements/${s.id}`} className="font-medium hover:text-gold">{s.title}</Link></td>
                    <td className="text-mute"><LocalTime value={s.createdAt} /></td>
                    <td className="text-sm text-mute">{s.sessions.map((x) => x.session.location.name + (x.session.title ? ` (${x.session.title})` : "")).join(", ")}</td>
                    <td>{s.collector?.characterName ?? <span className="text-mute">doğrudan</span>}</td>
                    <td className="text-right text-gold" title={noah(s.total)}>{noahShort(s.total)}</td>
                    <td className="text-right">{noahShort(s.perShare)} <span className="text-xs text-mute">× {s._count.shares}</span></td>
                    <td>{open === 0 ? <Badge tone="green">Tamamlandı</Badge> : <Badge tone="orange">{open} bekliyor</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
