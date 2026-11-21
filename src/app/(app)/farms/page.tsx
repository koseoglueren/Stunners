import Link from "next/link";
import { prisma } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth";
import { durationText, noahShort } from "@/lib/format";
import { first, type SearchParams } from "@/lib/forms";
import { lootContribution } from "@/lib/settlement";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { LocalTime } from "@/components/client";

export const metadata = { title: "Farm oturumları" };

export default async function FarmsPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireUser();
  const sp = await searchParams;
  const locationId = first(sp.yer) || undefined;
  const [sessions, locations] = await Promise.all([
    prisma.farmSession.findMany({
      where: { locationId },
      orderBy: { startAt: "desc" },
      take: 100,
      include: {
        location: true,
        members: { include: { user: true } },
        loot: true,
        settlements: { include: { settlement: true } },
      },
    }),
    prisma.farmLocation.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Farm oturumları"
        subtitle="Her parti ayrı bir oturumdur. Gün sonunda birden fazla oturum tek hesapta birleştirilebilir."
        actions={hasRole(me, "OFFICER") && <Link href="/farms/new" className="btn-primary">+ Yeni farm</Link>}
      />
      <Flash sp={sp} />
      <form className="mb-4 flex gap-2">
        <select name="yer" defaultValue={locationId ?? ""} className="input w-auto">
          <option value="">Tüm farm yerleri</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <button className="btn-ghost">Filtrele</button>
      </form>
      {sessions.length === 0 ? (
        <Empty>Henüz farm yok. {hasRole(me, "OFFICER") && <Link href="/farms/new" className="text-gold">İlk farmı başlat.</Link>}</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Farm</th>
                <th>Başlangıç</th>
                <th>Süre</th>
                <th>Ekip</th>
                <th className="text-right">Kazanç</th>
                <th className="text-right">Satılmayan</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const earned = s.loot.reduce((a, l) => a + (lootContribution(l)?.amount ?? 0n), 0n);
                const stock = s.loot.filter((l) => l.status === "IN_STOCK");
                const settled = s.settlements.length > 0;
                return (
                  <tr key={s.id} className="hover:bg-panel-2/60">
                    <td>
                      <Link href={`/farms/${s.id}`} className="font-medium hover:text-gold">{s.location.name}</Link>
                      {s.title && <span className="ml-2 text-xs text-mute">{s.title}</span>}
                    </td>
                    <td className="text-mute"><LocalTime value={s.startAt} /></td>
                    <td>{durationText(s.startAt, s.endAt)}</td>
                    <td className="max-w-56 truncate text-mute" title={s.members.map((m) => m.user.characterName).join(", ")}>
                      {s.members.length} kişi
                    </td>
                    <td className="text-right text-gold">{noahShort(earned)}</td>
                    <td className="text-right">{stock.length > 0 ? `${stock.length} item` : "-"}</td>
                    <td>
                      {s.status === "ACTIVE" ? (
                        <Badge tone="green">Devam ediyor</Badge>
                      ) : settled ? (
                        <Badge tone="gold">Hesaplandı</Badge>
                      ) : (
                        <Badge tone="orange">Bitti, hesap bekliyor</Badge>
                      )}
                    </td>
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
