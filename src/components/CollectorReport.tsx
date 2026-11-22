import { noah } from "@/lib/format";
import type { CollectorRow } from "@/lib/collector-report";
import { setTransferStatus } from "@/app/(app)/settlements/actions";
import { Badge } from "./ui";
import { SubmitButton } from "./client";

type Props = {
  rows: CollectorRow[];
  collectorId: string;
  name: (id: string) => string;
  /** when given, rows show status + buttons */
  live?: { me: string; officer: boolean; backTo: string };
};

function Status({ t, live, who }: { t: NonNullable<CollectorRow["delivery"]>; live: NonNullable<Props["live"]>; who: "delivery" | "payout" }) {
  const done = t.status === "RECEIVED";
  const label = who === "delivery" ? (done ? "Teslim alındı" : "Teslim bekleniyor") : done ? "Ödendi" : "Ödenmedi";
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <Badge tone={done ? "green" : "orange"}>{label}</Badge>
      {t.id && live.officer && !done && (
        <form action={setTransferStatus.bind(null, t.id, "RECEIVED", live.backTo)}>
          <SubmitButton className="btn-primary btn-sm">{who === "delivery" ? "Teslim aldım" : "Ödedim"}</SubmitButton>
        </form>
      )}
      {t.id && live.officer && done && (
        <form action={setTransferStatus.bind(null, t.id, "PENDING", live.backTo)}>
          <SubmitButton className="btn-ghost btn-sm">Geri al</SubmitButton>
        </form>
      )}
    </div>
  );
}

export function CollectorReport({ rows, collectorId, name, live }: Props) {
  const collector = name(collectorId);
  const totalDelivery = rows.reduce((a, r) => a + (r.delivery?.amount ?? 0n), 0n);
  const totalPayout = rows.reduce((a, r) => a + (r.payout?.amount ?? 0n), 0n);
  return (
    <div className="space-y-6">
      <div className="card overflow-x-auto p-0">
        <div className="px-5 pt-5">
          <h2 className="font-semibold">Teslim tutanağı</h2>
          <p className="text-sm text-mute">
            Herkes elindeki Noah&apos;ı ve satılmayan itemleri <b className="text-gold">{collector}</b> adlı üyeye teslim eder. Toplam teslim: {noah(totalDelivery)} Noah.
          </p>
        </div>
        <table className="table mt-2">
          <thead>
            <tr>
              <th>Üye</th>
              <th>Getirdiği</th>
              <th>Teslim ettiği item</th>
              <th className="text-right">Teslim edeceği Noah</th>
              {live && <th className="text-right">Durum</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId} className={live && r.userId === live.me ? "bg-gold/5" : ""}>
                <td className="font-medium">
                  {name(r.userId)}
                  {r.userId === collectorId && <div className="text-xs text-gold">kasa hesabı</div>}
                </td>
                <td className="text-sm">
                  {r.lines.length === 0 ? (
                    <span className="text-mute">-</span>
                  ) : (
                    <ul>
                      {r.lines.map((l, i) => (
                        <li key={i} className={l.kept ? "text-mute" : ""}>
                          {l.label}: {noah(l.amount)}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="text-sm">{r.items.length ? r.items.join(", ") : <span className="text-mute">-</span>}</td>
                <td className="text-right font-medium whitespace-nowrap">
                  {r.userId === collectorId ? <span className="text-mute">kendisinde</span> : r.delivery ? noah(r.delivery.amount) : "0"}
                </td>
                {live && <td>{r.delivery && <Status t={r.delivery} live={live} who="delivery" />}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto p-0">
        <div className="px-5 pt-5">
          <h2 className="font-semibold">{collector} kime ne kadar ödeyecek</h2>
          <p className="text-sm text-mute">Kendisi item alan üyenin item değeri payından düşülür. Toplam ödeme: {noah(totalPayout)} Noah.</p>
        </div>
        <table className="table mt-2">
          <thead>
            <tr>
              <th>Üye</th>
              <th className="text-right">Payı</th>
              <th className="text-right">Aldığı item</th>
              <th className="text-right">Ödenecek Noah</th>
              {live && <th className="text-right">Durum</th>}
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((r) => r.share > 0n || r.payout)
              .map((r) => (
                <tr key={r.userId} className={live && r.userId === live.me ? "bg-gold/5" : ""}>
                  <td className="font-medium">{name(r.userId)}</td>
                  <td className="text-right">{noah(r.share)}</td>
                  <td className="text-right text-mute">{r.kept > 0n ? `-${noah(r.kept)}` : "-"}</td>
                  <td className="text-right font-medium text-gold whitespace-nowrap">
                    {r.userId === collectorId ? <span className="text-mute">payını ayırır</span> : noah(r.payout?.amount ?? 0n)}
                  </td>
                  {live && <td>{r.payout && <Status t={r.payout} live={live} who="payout" />}</td>}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
