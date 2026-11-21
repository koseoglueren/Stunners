import { prisma } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth";
import { noah } from "@/lib/format";
import { first, type SearchParams } from "@/lib/forms";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { TransferTable } from "@/components/TransferTable";

export const metadata = { title: "Ödemeler" };

export default async function TransfersPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireUser();
  const sp = await searchParams;
  const scope = first(sp.kapsam) ?? "benim";
  const showDone = first(sp.tamamlanan) === "1";
  const where = {
    ...(scope === "benim" ? { OR: [{ fromId: me.id }, { toId: me.id }] } : {}),
    ...(showDone ? {} : { status: { not: "RECEIVED" as const } }),
  };
  const transfers = await prisma.transfer.findMany({
    where,
    include: { from: true, to: true, settlement: { select: { id: true, title: true } } },
    orderBy: [{ settlement: { createdAt: "desc" } }, { amount: "desc" }],
    take: 300,
  });
  const iOwe = transfers.filter((t) => t.fromId === me.id && t.status === "PENDING").reduce((a, t) => a + t.amount, 0n);
  const owedMe = transfers.filter((t) => t.toId === me.id && t.status !== "RECEIVED").reduce((a, t) => a + t.amount, 0n);
  const qs = (k: string, v: string) => {
    const p = new URLSearchParams({ kapsam: scope, tamamlanan: showDone ? "1" : "0", [k]: v });
    return `/transfers?${p}`;
  };
  return (
    <>
      <PageHeader title="Ödemeler" subtitle="Gün sonu hesaplarından çıkan oyun içi Noah transferleri." />
      <Flash sp={sp} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Stat label="Vermen gereken" value={noah(iOwe)} />
        <Stat label="Alacağın" value={noah(owedMe)} accent />
      </div>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <a href={qs("kapsam", "benim")} className={scope === "benim" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>Benimkiler</a>
        <a href={qs("kapsam", "hepsi")} className={scope === "hepsi" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>Tüm clan</a>
        <a href={qs("tamamlanan", showDone ? "0" : "1")} className="btn-ghost btn-sm">{showDone ? "Tamamlananları gizle" : "Tamamlananları da göster"}</a>
      </div>
      <div className="card p-0">
        {transfers.length === 0 ? (
          <div className="p-5"><Empty>Bekleyen ödeme yok.</Empty></div>
        ) : (
          <TransferTable transfers={transfers} me={me.id} officer={hasRole(me, "OFFICER")} backTo={`/transfers?kapsam=${scope}&tamamlanan=${showDone ? 1 : 0}`} showSettlement />
        )}
      </div>
    </>
  );
}
