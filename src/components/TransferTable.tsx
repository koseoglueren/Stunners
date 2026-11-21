import type { Transfer, User } from "@prisma/client";
import { noah } from "@/lib/format";
import { setTransferStatus } from "@/app/(app)/settlements/actions";
import { Badge } from "./ui";
import { SubmitButton } from "./client";
import Link from "next/link";

type T = Transfer & { from: User; to: User; settlement?: { id: string; title: string } };

export function TransferTable({ transfers, me, officer, backTo, showSettlement }: { transfers: T[]; me: string; officer: boolean; backTo: string; showSettlement?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            {showSettlement && <th>Hesap</th>}
            <th>Veren</th>
            <th></th>
            <th>Alan</th>
            <th className="text-right">Tutar (Noah)</th>
            <th>Durum</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((t) => {
            const mine = t.fromId === me || t.toId === me;
            return (
              <tr key={t.id} className={mine ? "bg-gold/5" : ""}>
                {showSettlement && (
                  <td>{t.settlement && <Link href={`/settlements/${t.settlement.id}`} className="hover:text-gold">{t.settlement.title}</Link>}</td>
                )}
                <td className={t.fromId === me ? "font-semibold text-gold" : ""}>{t.from.characterName}</td>
                <td className="text-mute">→</td>
                <td className={t.toId === me ? "font-semibold text-gold" : ""}>{t.to.characterName}</td>
                <td className="text-right font-medium">{noah(t.amount)}</td>
                <td className="whitespace-nowrap">
                  {t.kind === "DELIVERY" && <span className="mr-1 text-xs text-mute">Teslim</span>}
                  {t.kind === "PAYOUT" && <span className="mr-1 text-xs text-mute">Pay</span>}
                  <Badge tone={t.status === "RECEIVED" ? "green" : "orange"}>{t.status === "RECEIVED" ? (t.kind === "DELIVERY" ? "Teslim alındı" : "Ödendi") : "Bekliyor"}</Badge>
                </td>
                <td className="text-right whitespace-nowrap">
                  {officer && (
                    <form action={setTransferStatus.bind(null, t.id, t.status === "RECEIVED" ? "PENDING" : "RECEIVED", backTo)}>
                      <SubmitButton className={t.status === "RECEIVED" ? "btn-ghost btn-sm" : "btn-primary btn-sm"}>
                        {t.status === "RECEIVED" ? "Geri al" : t.kind === "DELIVERY" ? "Teslim aldım" : "Ödendi"}
                      </SubmitButton>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
