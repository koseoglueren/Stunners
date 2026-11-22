import { setTransferStatus } from "@/app/(app)/settlements/actions";
import { noah } from "@/lib/format";
import { Badge, Empty } from "./ui";
import { SubmitButton } from "./client";

type Share = { userId: string; share: bigint; kept?: bigint };
type Payout = { id?: string; toId: string; amount: bigint; status?: string };

/** who gets how much from the clan vault account */
export function PayoutList({
  shares,
  payouts,
  collectorId,
  name,
  live,
}: {
  shares: Share[];
  payouts: Payout[];
  collectorId: string;
  name: (id: string) => string;
  live?: { me: string; officer: boolean; backTo: string };
}) {
  const rows = shares.filter((s) => s.share > 0n).sort((a, b) => (b.share > a.share ? 1 : b.share < a.share ? -1 : 0));
  const total = rows.reduce((a, r) => a + r.share, 0n);
  return (
    <div className="card overflow-x-auto p-0">
      <h2 className="px-5 pt-5 font-semibold">Kime ne kadar ödenecek</h2>
      <p className="px-5 text-sm text-mute">Ödemeyi kasa hesabı ({name(collectorId)}) yapar.</p>
      {rows.length === 0 ? (
        <div className="p-5"><Empty>Paylaşılacak tutar yok.</Empty></div>
      ) : (
        <table className="table mt-2">
          <thead>
            <tr>
              <th>Üye</th>
              <th className="text-right">Ödenecek</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const p = payouts.find((x) => x.toId === s.userId);
              const isCollector = s.userId === collectorId;
              return (
                <tr key={s.userId} className={live?.me === s.userId ? "bg-gold/5" : ""}>
                  <td>{name(s.userId)}</td>
                  <td className="text-right text-gold whitespace-nowrap">{noah(p?.amount ?? (live ? s.share : s.share - (s.kept ?? 0n)))}</td>
                  <td>
                    {isCollector ? (
                      <Badge tone="gold">Kasada kalır</Badge>
                    ) : !p?.id ? (
                      <Badge>Önizleme</Badge>
                    ) : (
                      <span className="flex flex-wrap items-center gap-2">
                        {p.status === "RECEIVED" ? <Badge tone="green">Ödendi</Badge> : <Badge tone="orange">Ödeme bekliyor</Badge>}
                        {live?.officer && p.id && (
                          <form action={setTransferStatus.bind(null, p.id, p.status === "RECEIVED" ? "PENDING" : "RECEIVED", live.backTo)}>
                            <SubmitButton className="btn-ghost btn-sm">{p.status === "RECEIVED" ? "Geri al" : "Ödedim"}</SubmitButton>
                          </form>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="font-semibold">
              <td>Toplam</td>
              <td className="text-right text-gold">{noah(total)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

type Loot = { itemName: string; plusLevel: number | null; quantity: number; status: string };

/** the farm's items grouped by name: "Upgrade Scroll ×10" */
export function ItemSummary({ loot, title = "Farmın item listesi" }: { loot: Loot[]; title?: string }) {
  const groups = groupItems(loot);
  return (
    <div className="card overflow-x-auto p-0">
      <h2 className="px-5 pt-5 font-semibold">{title}</h2>
      {groups.length === 0 ? (
        <div className="p-5"><Empty>Item yok.</Empty></div>
      ) : (
        <table className="table mt-2">
          <thead>
            <tr>
              <th>Item</th>
              <th className="text-right">Adet</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key}>
                <td>{g.label}</td>
                <td className="text-right">{g.qty}</td>
                <td className="text-sm text-mute">
                  {g.sold > 0 && <span className="text-green-300">{g.sold} satıldı </span>}
                  {g.stock > 0 && <span className="text-orange-300">{g.stock} satılmadı </span>}
                  {g.given > 0 && <span>{g.given} verildi</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function groupItems(loot: Loot[]) {
  const map = new Map<string, { key: string; label: string; qty: number; sold: number; stock: number; given: number }>();
  for (const l of loot) {
    if (l.status === "COIN") continue;
    const label = `${l.itemName}${l.plusLevel !== null ? ` +${l.plusLevel}` : ""}`;
    const g = map.get(label) ?? { key: label, label, qty: 0, sold: 0, stock: 0, given: 0 };
    g.qty += l.quantity;
    if (l.status === "SOLD") g.sold += l.quantity;
    else if (l.status === "IN_STOCK") g.stock += l.quantity;
    else g.given += l.quantity;
    map.set(label, g);
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty || a.label.localeCompare(b.label, "tr"));
}
