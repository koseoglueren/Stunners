import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { durationText, lootStatusLabel, noah, noahShort } from "@/lib/format";
import { first, type SearchParams } from "@/lib/forms";
import { buildSettlementPreview } from "@/lib/settlement-data";
import { buildCollectorRows, itemLabel } from "@/lib/collector-report";
import { Alert, Badge, Empty, PageHeader, Stat } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { CollectorReport } from "@/components/CollectorReport";
import { LocalTime, SubmitButton } from "@/components/client";
import { getTreasurer } from "@/lib/clan";
import { createSettlement } from "../actions";

export const metadata = { title: "Gün sonu hesabı" };

export default async function NewSettlementPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireRole("OFFICER");
  const sp = await searchParams;
  const selected = [sp.oturum].flat().filter((x): x is string => !!x);
  const treasurer = await getTreasurer();
  const collectorId = first(sp.dagitici) || treasurer?.id || me.id;
  const handover = first(sp.teslim) !== "0";

  // candidate sessions: anything with loot not yet settled, plus selected ones
  const [candidates, people] = await Promise.all([
    prisma.farmSession.findMany({
      where: {
        OR: [
          { id: { in: selected } },
          { loot: { some: { settlementId: null, status: { in: ["COIN", "SOLD", "GIVEN"] } } } },
          { settlements: { none: {} }, status: "FINISHED" },
        ],
      },
      include: { location: true, _count: { select: { members: true } } },
      orderBy: { startAt: "desc" },
      take: 60,
    }),
    prisma.user.findMany({ where: { active: true }, orderBy: { characterName: "asc" } }),
  ]);
  const preview = selected.length ? await buildSettlementPreview(selected, collectorId) : null;
  const name = (id: string) => preview?.users.get(id)?.characterName ?? people.find((p) => p.id === id)?.characterName ?? "?";
  const handedItems = preview && collectorId && handover ? preview.unsold.filter((l) => l.holderId !== collectorId).map((l) => ({ ...l, handedOverById: l.holderId })) : [];
  const defaultTitle = `Gün sonu ${new Date().toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}`;

  return (
    <>
      <PageHeader
        title="Gün sonu hesabı"
        subtitle="Günün farmlarını seç. Herkes elindekini kasa hesabına teslim eder, kasa herkese payını öder. Coin farmda geçirilen süreye göre, satılan item ise pay sahiplerine eşit bölünür."
        actions={<Link href="/settlements" className="btn-ghost">← Hesaplar</Link>}
      />
      <Flash sp={sp} />
      <form className="card mb-6 space-y-5" method="get">
        <div>
          <h2 className="mb-3 font-semibold">1. Farmları seç</h2>
          {candidates.length === 0 ? (
            <Empty>Hesaplanmayı bekleyen farm yok.</Empty>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {candidates.map((s) => (
                <label key={s.id} className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm hover:border-gold/50">
                  <input type="checkbox" name="oturum" value={s.id} defaultChecked={selected.includes(s.id)} className="accent-[#d4a64a]" />
                  <span className="font-medium">{s.location.name}{s.title ? ` · ${s.title}` : ""}</span>
                  <span className="text-mute"><LocalTime value={s.startAt} /> · {durationText(s.startAt, s.endAt)} · {s._count.members} kişi</span>
                  {s.status === "ACTIVE" && <Badge tone="green">devam ediyor</Badge>}
                </label>
              ))}
            </div>
          )}
        </div>
        <div>
          <h2 className="mb-3 font-semibold">2. Kasa hesabı</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">Farmı teslim alacak üye (clan kasası)</label>
              <select name="dagitici" className="input" defaultValue={collectorId}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.characterName}</option>
                ))}
              </select>
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" name="teslim" value="1" defaultChecked={handover} className="accent-[#d4a64a]" />
              Satılmayan itemler de kasaya teslim edilsin
              <input type="hidden" name="teslim" value="0" />
            </label>
          </div>
        </div>
        <button className="btn-ghost">Hesabı göster</button>
      </form>

      {preview && (
        <>
          <h2 className="mb-3 font-semibold">3. Önizleme</h2>
          {preview.active.length > 0 && <Alert>Seçilenlerden {preview.active.length} farm hâlâ devam ediyor. Kilitlemeden önce farmı bitir.</Alert>}
          {preview.unsold.length > 0 && (
            <Alert tone="gold">
              {preview.unsold.length} item henüz satılmadı (tahmini {noahShort(preview.unsold.reduce((a, l) => a + l.value, 0n))}). Bu hesaba Noah olarak girmez;
              {handover ? " kasaya teslim edilir," : ""} satılınca aynı farmlar için ek hesap yapılır.
            </Alert>
          )}
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Stat label="Toplam" value={noahShort(preview.total)} hint={`${noah(preview.total)} Noah`} accent />
            <Stat label="Kişi sayısı" value={new Set(preview.sessions.flatMap((x) => x.members.map((m) => m.userId))).size} />
            <Stat label="Ortalama pay" value={noahShort(preview.perShare)} hint="Coin süreye, item pay sahiplerine göre bölünür" />
          </div>

          <CollectorReport
            rows={buildCollectorRows(collectorId, preview.shares, preview.transfers, preview.included.map((i) => i.loot), handedItems)}
            collectorId={collectorId}
            name={name}
          />

          <div className="card mt-6">
            <h3 className="mb-2 font-semibold">Hesaba giren kayıtlar ({preview.included.length})</h3>
            <ul className="grid max-h-64 gap-x-8 gap-y-1 overflow-y-auto text-sm md:grid-cols-2">
              {preview.included.map(({ loot, amount, beneficiaries }) => (
                <li key={loot.id} className="flex justify-between gap-2">
                  <span>
                    {itemLabel(loot)} <span className="text-xs text-mute">({lootStatusLabel[loot.status]} · {beneficiaries.length} kişiye)</span>
                  </span>
                  <span>{noah(amount)}</span>
                </li>
              ))}
            </ul>
          </div>

          <form action={createSettlement} className="card mt-6 flex flex-wrap items-end gap-3">
            {selected.map((id) => (
              <input key={id} type="hidden" name="sessionIds" value={id} />
            ))}
            <input type="hidden" name="collectorId" value={collectorId} />
            {handover && <input type="hidden" name="handover" value="1" />}
            <div className="min-w-64 flex-1">
              <label className="label">Hesap adı</label>
              <input name="title" className="input" defaultValue={defaultTitle} />
            </div>
            <SubmitButton confirm="Hesap kilitlensin mi? Kilitlenen kayıtlar değiştirilemez.">4. Hesabı kilitle</SubmitButton>
          </form>
        </>
      )}
    </>
  );
}
