import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { durationText, lootStatusLabel, noah, noahShort } from "@/lib/format";
import { first, type SearchParams } from "@/lib/forms";
import { buildSettlementPreview } from "@/lib/settlement-data";
import { itemLabel } from "@/lib/collector-report";
import { Alert, Badge, Empty, PageHeader, Stat } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { ItemSummary, PayoutList } from "@/components/SettlementParts";
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
  const merged = first(sp.birlestir) === "1";

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
  const [preview, farmLoot] = selected.length
    ? await Promise.all([
        buildSettlementPreview(selected, collectorId, merged),
        prisma.lootEntry.findMany({ where: { sessionId: { in: selected } }, select: { itemName: true, plusLevel: true, quantity: true, status: true } }),
      ])
    : [null, []];
  const name = (id: string) => preview?.users.get(id)?.characterName ?? people.find((p) => p.id === id)?.characterName ?? "?";
  const defaultTitle = `${merged ? "Birleşik gün sonu" : "Gün sonu"} ${new Date().toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}`;

  return (
    <>
      <PageHeader
        title="Gün sonu hesabı"
        subtitle="Günün farmlarını seç. Coin ve itemler farm sırasında kasaya alınır, kasa herkese payını öder. Coin farmda geçirilen süreye göre, satılan item ise pay sahiplerine eşit bölünür."
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
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="birlestir" value="1" defaultChecked={merged} className="mt-1 accent-[#d4a64a]" />
          <span>
            <b>Farmları birleştir (ortak havuz)</b>
            <span className="block text-mute">Seçilen farmların tüm kazancı tek havuzda toplanır ve bu farmlardaki herkese eşit bölünür (süre ve item pay sahipleri dikkate alınmaz).</span>
          </span>
        </label>
        <button className="btn-ghost">Hesabı göster</button>
      </form>

      {preview && (
        <>
          <h2 className="mb-3 font-semibold">3. Önizleme</h2>
          {preview.active.length > 0 && <Alert>Seçilenlerden {preview.active.length} farm hâlâ devam ediyor. Kilitlemeden önce farmı bitir.</Alert>}
          {preview.unsold.length > 0 && (
            <Alert tone="gold">
              {preview.unsold.length} item henüz satılmadı (tahmini {noahShort(preview.unsold.reduce((a, l) => a + l.value, 0n))}). Bu hesaba Noah olarak girmez; kasada kalır, satılınca aynı farmlar için ek hesap yapılır.
            </Alert>
          )}
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Stat label="Toplam" value={noahShort(preview.total)} hint={`${noah(preview.total)} Noah`} accent />
            <Stat label="Kişi sayısı" value={new Set(preview.sessions.flatMap((x) => x.members.map((m) => m.userId))).size} />
            <Stat label="Ortalama pay" value={noahShort(preview.perShare)} hint={merged ? "Birleşik: herkese eşit" : "Coin süreye, item pay sahiplerine göre bölünür"} />
          </div>

          <div className="space-y-6">
            <PayoutList shares={preview.shares} payouts={preview.transfers} collectorId={collectorId} name={name} />
            <ItemSummary loot={farmLoot} />
          </div>

          <div className="card mt-6">
            <h3 className="mb-2 font-semibold">Hesaba giren kayıtlar ({preview.included.length})</h3>
            <ul className="grid max-h-64 gap-x-8 gap-y-1 overflow-y-auto text-sm md:grid-cols-2">
              {preview.included.map(({ loot, amount, beneficiaries, holderId }) => (
                <li key={loot.id} className="flex justify-between gap-2">
                  <span>
                    {itemLabel(loot)} <span className="text-xs text-mute">({lootStatusLabel[loot.status]} · {loot.status === "SOLD" ? "satan" : "getiren"}: <b className="text-ink">{name(loot.status === "SOLD" ? holderId : (loot.handedOverById ?? holderId))}</b> · {beneficiaries.length} kişiye)</span>
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
            {merged && <input type="hidden" name="merged" value="1" />}
            <input type="hidden" name="handover" value="1" />
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
