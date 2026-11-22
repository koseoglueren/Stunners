import Link from "next/link";
import { prisma } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth";
import { categoryLabel, noah, noahShort } from "@/lib/format";
import type { SearchParams } from "@/lib/forms";
import { Badge, Empty, PageHeader, Stat } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { LocalTime, SubmitButton } from "@/components/client";
import { addVaultItem, deleteLoot, giveLoot, sellLoot, setLootVault, updateLootValue } from "../farms/actions";
import { VaultForm } from "./VaultForm";

export const metadata = { title: "Clan kasası" };

const sessionInclude = {
  location: true,
  members: { include: { user: true }, orderBy: { user: { characterName: "asc" as const } } },
} as const;

function ItemName({ l }: { l: { itemName: string; plusLevel: number | null; quantity: number } }) {
  return (
    <>
      {l.itemName}
      {l.plusLevel !== null && <span className="text-gold"> +{l.plusLevel}</span>}
      {l.quantity > 1 && <span className="text-mute"> ×{l.quantity}</span>}
    </>
  );
}

export default async function VaultPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireUser();
  const sp = await searchParams;
  const officer = hasRole(me, "OFFICER");

  const [vault, farmStock, soldWaiting, items, members, farms] = await Promise.all([
    prisma.lootEntry.findMany({
      where: { status: "IN_STOCK", inVault: true },
      include: { holder: true, session: { include: sessionInclude } },
      orderBy: [{ vaultAt: "desc" }, { droppedAt: "desc" }],
    }),
    prisma.lootEntry.findMany({
      where: { status: "IN_STOCK", inVault: false, sessionId: { not: null } },
      include: { holder: true, session: { include: { location: true } } },
      orderBy: { droppedAt: "desc" },
    }),
    prisma.lootEntry.findMany({
      where: { status: "SOLD", settlementId: null, inVault: true },
      include: { soldBy: true, holder: true, session: { include: sessionInclude } },
      orderBy: { soldAt: "desc" },
    }),
    officer ? prisma.itemCatalog.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : [],
    officer ? prisma.user.findMany({ where: { active: true }, orderBy: { characterName: "asc" } }) : [],
    officer
      ? prisma.farmSession.findMany({ include: { location: true, _count: { select: { members: true } } }, orderBy: { startAt: "desc" }, take: 40 })
      : [],
  ]);

  const total = vault.reduce((a, l) => a + l.value, 0n);
  const soldTotal = soldWaiting.reduce((a, l) => a + (l.salePrice ?? 0n), 0n);
  const allOpts = members.map((m) => ({ id: m.id, name: m.characterName }));
  const dateFmt = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Istanbul" });
  const farmOpts = farms.map((f) => ({
    id: f.id,
    name: `${dateFmt.format(f.startAt)} · ${f.location.name}${f.title ? ` · ${f.title}` : ""} (${f._count.members} kişi)`,
  }));

  // group sold-but-undistributed by farm
  const soldByFarm = new Map<string, { id: string | null; name: string; total: bigint; count: number }>();
  for (const l of soldWaiting) {
    const key = l.sessionId ?? "clan";
    const g = soldByFarm.get(key) ?? {
      id: l.sessionId,
      name: l.session ? `${l.session.location.name}${l.session.title ? ` · ${l.session.title}` : ""}` : "Clan malı",
      total: 0n,
      count: 0,
    };
    g.total += l.salePrice ?? 0n;
    g.count += 1;
    soldByFarm.set(key, g);
  }

  return (
    <>
      <PageHeader
        title="Clan kasası"
        subtitle="Pazarda satılmayı bekleyen itemler. Her item hangi farmdan geldiyse satış parası o farmın ekibine eşit dağıtılır."
      />
      <Flash sp={sp} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Kasada bekleyen (tahmini)" value={noahShort(total)} hint={`${vault.length} kayıt · ${noah(total)} Noah`} accent />
        <Stat label="Satıldı, dağıtım bekliyor" value={noahShort(soldTotal)} hint={`${soldWaiting.length} item`} />
        <Stat label="Kasaya eklenmemiş farm itemi" value={farmStock.length} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <div className="card p-0">
            <h2 className="px-5 pt-5 font-semibold">Kasadaki itemler ({vault.length})</h2>
            {vault.length === 0 ? (
              <div className="p-5"><Empty>Kasada item yok. Farm sayfasından &quot;Clan kasasına ekle&quot; diyebilir veya elle ekleyebilirsin.</Empty></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table mt-2">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Kime ait</th>
                      <th>Kimde</th>
                      <th className="text-right">Tahmini</th>
                      {officer && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {vault.map((l) => {
                      const receivers = l.session ? l.session.members.map((m) => ({ id: m.userId, name: m.user.characterName })) : allOpts;
                      return (
                        <tr key={l.id}>
                          <td>
                            <div className="font-medium"><ItemName l={l} /></div>
                            <div className="text-xs text-mute">
                              {categoryLabel[l.category]} · <LocalTime value={l.vaultAt ?? l.droppedAt} mode="date" />
                              {l.note && ` · ${l.note}`}
                            </div>
                          </td>
                          <td className="text-sm">
                            {l.session ? (
                              <>
                                <Link href={`/farms/${l.sessionId}#pazar`} className="hover:text-gold">
                                  {l.session.location.name}
                                  {l.session.title ? ` · ${l.session.title}` : ""}
                                </Link>{" "}
                                <span className="text-xs text-mute">(<LocalTime value={l.session.startAt} mode="date" />)</span>
                                <div className="max-w-64 text-xs text-mute" title={l.session.members.map((m) => m.user.characterName).join(", ")}>
                                  {l.session.members.length} kişi: {l.session.members.map((m) => m.user.characterName).join(", ")}
                                </div>
                              </>
                            ) : (
                              <Badge tone="gold">Clan malı</Badge>
                            )}
                          </td>
                          <td className="text-sm">{l.holder.characterName}</td>
                          <td className="text-right whitespace-nowrap">~{noah(l.value)}</td>
                          {officer && (
                            <td className="text-right">
                              <details className="relative inline-block text-left">
                                <summary className="btn-ghost btn-sm cursor-pointer list-none">İşlem</summary>
                                <div className="absolute right-0 z-20 mt-1 w-72 space-y-3 rounded-lg border border-line bg-panel-2 p-3 shadow-xl">
                                  <form action={sellLoot.bind(null, l.id)} className="space-y-2">
                                    <input type="hidden" name="back" value="/vault" />
                                    <div className="text-xs font-semibold text-mute uppercase">Pazarda satıldı</div>
                                    <input name="salePrice" className="input" placeholder="Satış fiyatı (örn. 45m)" required />
                                    <select name="soldById" className="input" defaultValue={l.holderId}>
                                      {allOpts.map((m) => (
                                        <option key={m.id} value={m.id}>Satan: {m.name}</option>
                                      ))}
                                    </select>
                                    <SubmitButton className="btn-primary btn-sm w-full">Satışı kaydet</SubmitButton>
                                  </form>
                                  <form action={giveLoot.bind(null, l.id)} className="space-y-2 border-t border-line pt-3">
                                    <input type="hidden" name="back" value="/vault" />
                                    <div className="text-xs font-semibold text-mute uppercase">Üyeye ver (payından düşülür)</div>
                                    <select name="receiverId" className="input" defaultValue="">
                                      <option value="" disabled>Alan üye</option>
                                      {receivers.map((m) => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                      ))}
                                    </select>
                                    <input name="value" className="input" placeholder="Değeri" defaultValue={noah(l.value)} required />
                                    <SubmitButton className="btn-ghost btn-sm w-full">Üyeye ver</SubmitButton>
                                  </form>
                                  <form action={updateLootValue.bind(null, l.id)} className="flex gap-2 border-t border-line pt-3">
                                    <input type="hidden" name="back" value="/vault" />
                                    <input name="value" className="input" defaultValue={noah(l.value)} aria-label="Tahmini değer" />
                                    <SubmitButton className="btn-ghost btn-sm">Değeri güncelle</SubmitButton>
                                  </form>
                                  <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                                    {l.sessionId && (
                                      <form action={setLootVault.bind(null, l.id, false, "/vault")}>
                                        <SubmitButton className="btn-ghost btn-sm">Kasadan çıkar</SubmitButton>
                                      </form>
                                    )}
                                    <form action={deleteLoot.bind(null, l.id, "/vault")}>
                                      <SubmitButton className="btn-danger btn-sm" confirm="Kayıt tamamen silinsin mi?">Sil</SubmitButton>
                                    </form>
                                  </div>
                                </div>
                              </details>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {soldWaiting.length > 0 && (
            <div className="card">
              <h2 className="mb-1 font-semibold">Satıldı, dağıtım bekliyor</h2>
              <p className="mb-3 text-sm text-mute">Pazarda satılan itemlerin parası, itemin geldiği farmın ekibine gün sonu hesabıyla (hesap yapılmışsa ek hesapla) dağıtılır.</p>
              <ul className="divide-y divide-line text-sm">
                {[...soldByFarm.values()].map((g) => (
                  <li key={g.id ?? "clan"} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      {g.id ? <Link href={`/farms/${g.id}#pazar`} className="hover:text-gold">{g.name}</Link> : g.name}
                      <span className="text-mute"> · {g.count} item</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-green-300">{noah(g.total)}</span>
                      {officer && g.id && (
                        <Link href={`/settlements/new?oturum=${g.id}`} className="btn-primary btn-sm">Dağıtımı yap</Link>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-mute">Satış detayları</summary>
                <ul className="mt-2 space-y-1">
                  {soldWaiting.map((l) => (
                    <li key={l.id} className="flex justify-between gap-2">
                      <span><ItemName l={l} /> <span className="text-mute">· satan {l.soldBy?.characterName ?? l.holder.characterName}</span></span>
                      <span>{noah(l.salePrice)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}

          {officer && farmStock.length > 0 && (
            <div className="card p-0">
              <h2 className="px-5 pt-5 font-semibold">Farmlarda satılmamış, kasaya eklenmemiş ({farmStock.length})</h2>
              <p className="px-5 text-sm text-mute">Pazarda satılacaksa kasaya ekle.</p>
              <div className="overflow-x-auto">
                <table className="table mt-2">
                  <tbody>
                    {farmStock.map((l) => (
                      <tr key={l.id}>
                        <td><ItemName l={l} /></td>
                        <td className="text-sm">
                          <Link href={`/farms/${l.sessionId}#loot`} className="hover:text-gold">{l.session!.location.name}</Link>{" "}
                          <span className="text-xs text-mute"><LocalTime value={l.droppedAt} mode="date" /></span>
                        </td>
                        <td className="text-sm">{l.holder.characterName}</td>
                        <td className="text-right">
                          <form action={setLootVault.bind(null, l.id, true, "/vault")}>
                            <SubmitButton className="btn-ghost btn-sm">Kasaya ekle</SubmitButton>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {officer ? (
            <div className="card">
              <h2 className="mb-3 font-semibold">Elle ekle</h2>
              <VaultForm
                action={addVaultItem}
                items={items.filter((i) => i.category !== "COIN").map((i) => ({ id: i.id, name: i.name, category: i.category, price: i.defaultPrice.toString() }))}
                members={allOpts}
                farms={farmOpts}
                defaultHolder={me.id}
              />
            </div>
          ) : (
            <div className="card text-sm text-mute">Kasayı sadece yöneticiler düzenleyebilir.</div>
          )}
        </div>
      </div>
    </>
  );
}
