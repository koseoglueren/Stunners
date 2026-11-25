import Link from "next/link";
import { prisma } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth";
import { durationText, hoursBetween, noah, noahShort } from "@/lib/format";
import { first, type SearchParams } from "@/lib/forms";
import { lootEarnings, sessionEarnings } from "@/lib/earnings";
import { groupItems } from "@/components/SettlementParts";
import { Alert, Empty, PageHeader, Stat } from "@/components/ui";
import { LocalTime } from "@/components/client";

const DAY = 86_400_000;
const dayKey = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
const farmName = (s: { title: string | null; location: { name: string } }) => `${s.location.name}${s.title ? ` · ${s.title}` : ""}`;

export default async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireUser();
  const sp = await searchParams;
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * DAY);
  const since15 = new Date(now.getTime() - 14 * DAY);
  since15.setHours(0, 0, 0, 0);
  const since7 = new Date(now.getTime() - 7 * DAY);
  const chart = first(sp.grafik) === "kisisel" ? "kisisel" : "genel";

  const [sessions, myShares, owed] = await Promise.all([
    prisma.farmSession.findMany({
      where: { startAt: { gte: since30 } },
      include: {
        location: true,
        members: { include: { user: true } },
        loot: { include: { owners: { select: { userId: true } }, holder: true, handedOverBy: true } },
      },
      orderBy: { startAt: "desc" },
    }),
    prisma.settlementShare.aggregate({ where: { userId: me.id }, _sum: { share: true } }),
    prisma.transfer.aggregate({ where: { toId: me.id, status: { not: "RECEIVED" } }, _sum: { amount: true } }),
  ]);

  const names = new Map<string, string>();
  for (const s of sessions) for (const m of s.members) names.set(m.userId, m.user.characterName);

  const farms = sessions.map((s) => {
    const e = sessionEarnings(s, now);
    const hours = hoursBetween(s.startAt, s.endAt);
    const people = s.members.length;
    return {
      s,
      ...e,
      people,
      perHead: people ? e.total / BigInt(people) : 0n,
      perHour: hours > 0 ? (e.total * 60n) / BigInt(Math.max(1, Math.round(hours * 60))) : 0n,
    };
  });
  const week = farms.filter((f) => f.s.startAt >= since7);
  const selected = farms.find((f) => f.s.id === first(sp.farm)) ?? null;
  const scope = selected ? [selected] : week;
  const officer = hasRole(me, "OFFICER");
  const chartUser = chart === "kisisel" && officer && first(sp.uye) ? first(sp.uye)! : me.id;
  const link = (q: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const farm = "farm" in q ? q.farm : selected?.s.id;
    const g = "grafik" in q ? q.grafik : chart;
    if (farm) p.set("farm", farm);
    if (g && g !== "genel") p.set("grafik", g);
    if (g === "kisisel" && chartUser !== me.id) p.set("uye", chartUser);
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  // 15 days chart: clan total or my own part, by drop day
  const days: { key: string; label: string; total: bigint }[] = [];
  for (let i = 14; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY);
    days.push({ key: dayKey(d), label: d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Istanbul" }), total: 0n });
  }
  for (const s of sessions) {
    if (s.startAt < since15 && (s.endAt ?? now) < since15) continue;
    for (const l of s.loot) {
      const e = lootEarnings(l, s, now);
      const day = e && days.find((x) => x.key === dayKey(l.droppedAt));
      if (!e || !day) continue;
      day.total += chart === "kisisel" ? (e.perMember.get(chartUser) ?? 0n) : e.amount;
    }
  }
  const max = days.reduce((a, d) => (d.total > a ? d.total : a), 1n);
  const chartTotal = days.reduce((a, d) => a + d.total, 0n);

  // top 10 earners of the last 30 days (or of the selected farm)
  const earners = new Map<string, bigint>();
  for (const f of selected ? [selected] : farms) for (const [uid, amt] of f.perMember) earners.set(uid, (earners.get(uid) ?? 0n) + amt);
  const top = [...earners].filter(([, a]) => a > 0n).sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0)).slice(0, 10);

  const scopeTotal = scope.reduce((a, f) => a + f.total, 0n);
  // dropped items, the same item (name + plus) on one line: total count, who brought how many
  type Drop = { key: string; name: string; plus: number | null; qty: number; sold: number; last: Date; farms: Map<string, (typeof scope)[number]["s"]>; by: Map<string, number> };
  const dropMap = new Map<string, Drop>();
  for (const f of scope)
    for (const l of f.s.loot) {
      if (l.status === "COIN") continue;
      const key = `${l.itemName.trim().toLocaleLowerCase("tr")}|${l.plusLevel ?? ""}`;
      const d = dropMap.get(key) ?? { key, name: l.itemName, plus: l.plusLevel, qty: 0, sold: 0, last: l.droppedAt, farms: new Map(), by: new Map() };
      d.qty += l.quantity;
      if (l.status === "SOLD") d.sold += l.quantity;
      if (l.droppedAt > d.last) d.last = l.droppedAt;
      d.farms.set(f.s.id, f.s);
      const who = (l.handedOverBy ?? l.holder).characterName;
      d.by.set(who, (d.by.get(who) ?? 0) + l.quantity);
      dropMap.set(key, d);
    }
  const drops = [...dropMap.values()].sort((a, b) => b.last.getTime() - a.last.getTime()).slice(0, 15);
  const vault = await prisma.lootEntry.findMany({
    where: { status: "IN_STOCK", inVault: true, ...(selected ? { sessionId: selected.s.id } : {}) },
    select: { itemName: true, plusLevel: true, quantity: true, status: true, value: true },
  });
  const vaultGroups = groupItems(vault);
  const active = sessions.filter((s) => s.status === "ACTIVE");

  return (
    <>
      <PageHeader
        title={`Hoş geldin, ${me.characterName}`}
        subtitle={selected ? <>Seçili farm: <b className="text-gold">{farmName(selected.s)}</b> · <Link href={link({ farm: undefined })} className="text-gold">Tüm farmlar →</Link></> : "STUNNERS clan farm özeti (son 7 gün)"}
        actions={officer && <Link href="/farms/new" className="btn-primary">+ Yeni farm</Link>}
      />
      {first(sp.yetki) === "yok" && <Alert>Bu sayfa için yetkin yok.</Alert>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {selected ? (
          <>
            <Stat label="Farm kazancı" value={noahShort(selected.total)} hint={`${noah(selected.total)} Noah`} accent />
            <Stat label="Kişi başı ortalama" value={noahShort(selected.perHead)} hint={`${selected.people} kişi`} />
            <Stat label="Farm süresi" value={durationText(selected.s.startAt, selected.s.endAt)} hint={<LocalTime value={selected.s.startAt} />} />
            <Stat label="Saatlik kazanç" value={noahShort(selected.perHour)} hint="Noah / saat" />
          </>
        ) : (
          <>
            <Stat label="Son 7 gün clan kazancı" value={noahShort(scopeTotal)} hint={`${week.length} farm · ${noah(scopeTotal)} Noah`} accent />
            <Stat label="Kişi başı ortalama" value={noahShort(week.length ? week.reduce((a, f) => a + f.perHead, 0n) / BigInt(week.length) : 0n)} hint="farm başına" />
            <Stat label="Toplam kazancın" value={noahShort(myShares._sum.share ?? 0n)} hint={<Link href="/payim" className="text-gold">Payım →</Link>} />
            <Stat label="Alacağın" value={noahShort(owed._sum.amount ?? 0n)} hint="kasanın sana ödeyeceği" />
          </>
        )}
      </div>

      {active.length > 0 && (
        <div className="card mb-6 border-good/40">
          <h2 className="mb-2 font-semibold text-green-300">Devam eden farmlar</h2>
          <ul className="space-y-1 text-sm">
            {active.map((s) => (
              <li key={s.id} className="flex justify-between">
                <Link href={`/farms/${s.id}`} className="hover:text-gold">{farmName(s)}</Link>
                <span className="text-mute">{s.members.length} kişi · {durationText(s.startAt, null)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card mb-6 overflow-x-auto p-0">
        <h2 className="px-5 pt-5 font-semibold">Son 7 gün farmlar</h2>
        <p className="px-5 text-xs text-mute">Bir farma tıklarsan sayfa o farmın verilerini gösterir.</p>
        {week.length === 0 ? (
          <div className="p-5"><Empty>Son 7 günde farm yok.</Empty></div>
        ) : (
          <table className="table mt-2">
            <thead>
              <tr>
                <th>Farm tarihi</th>
                <th>Farm yeri</th>
                <th className="text-right">Kişiler</th>
                <th className="text-right">Süre</th>
                <th className="text-right">Farm kazancı</th>
                <th className="text-right">Kişi başı ort.</th>
                <th className="text-right">Saatlik</th>
              </tr>
            </thead>
            <tbody>
              {week.map((f) => {
                const on = selected?.s.id === f.s.id;
                return (
                  <tr key={f.s.id} className={on ? "bg-gold/10" : ""}>
                    <td><Link href={link({ farm: on ? undefined : f.s.id })} className="hover:text-gold"><LocalTime value={f.s.startAt} /></Link></td>
                    <td><Link href={link({ farm: on ? undefined : f.s.id })} className={on ? "font-semibold text-gold" : "hover:text-gold"}>{farmName(f.s)}</Link>{f.s.status === "ACTIVE" && <span className="ml-1 text-xs text-green-300">devam ediyor</span>}</td>
                    <td className="text-right">{f.people}</td>
                    <td className="whitespace-nowrap text-right text-mute">{durationText(f.s.startAt, f.s.endAt)}</td>
                    <td className="text-right text-gold">{noahShort(f.total)}</td>
                    <td className="text-right">{noahShort(f.perHead)}</td>
                    <td className="text-right text-mute">{noahShort(f.perHour)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="card xl:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Son 15 gün kazanç <span className="text-sm font-normal text-mute">· {noahShort(chartTotal)}</span></h2>
            <div className="flex gap-1">
              <Link href={link({ grafik: "genel" })} className={`btn-sm ${chart === "genel" ? "btn-primary" : "btn-ghost"}`}>Genel</Link>
              <Link href={link({ grafik: "kisisel" })} className={`btn-sm ${chart === "kisisel" ? "btn-primary" : "btn-ghost"}`}>Kişisel</Link>
            </div>
          </div>
          <div className="-mt-2 mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-mute">
            <span>{chart === "genel" ? "Clanın günlük toplam kazancı (coin + satılan itemler)." : `${chartUser === me.id ? "Senin" : (names.get(chartUser) ?? "?") + " için"} günlük pay (farmdaki süre ve item payları).`}</span>
            {chart === "kisisel" && officer && (
              <form method="get" className="flex items-center gap-1">
                {selected && <input type="hidden" name="farm" value={selected.s.id} />}
                <input type="hidden" name="grafik" value="kisisel" />
                <select name="uye" defaultValue={chartUser} className="input w-auto py-1 text-xs">
                  <option value={me.id}>{me.characterName}</option>
                  {[...names].filter(([id]) => id !== me.id).sort((a, b) => a[1].localeCompare(b[1], "tr")).map(([id, n]) => (
                    <option key={id} value={id}>{n}</option>
                  ))}
                </select>
                <button className="btn-ghost btn-sm">Göster</button>
              </form>
            )}
          </div>
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
          <h2 className="mb-3 font-semibold">{selected ? "Bu farmda en çok kazananlar" : "Son 30 gün en çok kazanan 10 kişi"}</h2>
          {top.length === 0 ? (
            <Empty>Henüz kazanç yok.</Empty>
          ) : (
            <ol className="space-y-1.5 text-sm">
              {top.map(([uid, amt], i) => (
                <li key={uid} className={`flex justify-between ${uid === me.id ? "text-gold" : ""}`}>
                  <span><span className="mr-2 inline-block w-5 text-right text-gold">{i + 1}.</span>{names.get(uid) ?? "?"}</span>
                  <span>{noahShort(amt)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="card overflow-x-auto p-0 xl:col-span-2">
          <h2 className="px-5 pt-5 font-semibold">Son düşen itemler</h2>
          {drops.length === 0 ? (
            <div className="p-5"><Empty>Henüz item düşmedi.</Empty></div>
          ) : (
            <table className="table mt-2 text-sm">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="text-right">Adet</th>
                  <th>Farm</th>
                  <th>Getiren</th>
                  <th className="text-right">Saat</th>
                </tr>
              </thead>
              <tbody>
                {drops.map((d) => (
                  <tr key={d.key}>
                    <td>
                      {d.name}
                      {d.plus !== null && <span className="text-gold"> +{d.plus}</span>}
                      {d.sold > 0 && <span className="text-xs text-green-300"> · {d.sold === d.qty ? "satıldı" : `${d.sold} satıldı`}</span>}
                    </td>
                    <td className="text-right text-gold">{d.qty}</td>
                    <td className="text-mute">
                      {[...d.farms.values()].map((s, i) => (
                        <span key={s.id}>{i > 0 && ", "}<Link href={`/farms/${s.id}`} className="hover:text-gold">{farmName(s)}</Link></span>
                      ))}
                    </td>
                    <td>
                      {[...d.by].sort((a, b) => b[1] - a[1]).map(([who, n], i) => (
                        <span key={who} className="whitespace-nowrap">{i > 0 && ", "}{who} <span className="text-gold">{n}</span></span>
                      ))}
                    </td>
                    <td className="whitespace-nowrap text-right text-mute"><LocalTime value={d.last} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Clan kasası itemleri</h2>
            <Link href="/vault" className="text-sm text-gold">Kasa →</Link>
          </div>
          {vaultGroups.length === 0 ? (
            <Empty>Kasada satılmayı bekleyen item yok.</Empty>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
              {vaultGroups.map((g) => (
                <li key={g.key} className="flex justify-between gap-2">
                  <span>{g.label}</span>
                  <span className="whitespace-nowrap text-gold">{g.qty} Adet</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
