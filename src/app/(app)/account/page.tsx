import { requireUser } from "@/lib/auth";
import { roleLabel } from "@/lib/format";
import type { SearchParams } from "@/lib/forms";
import { PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/client";
import { changePassword } from "./actions";

export const metadata = { title: "Hesabım" };

export default async function AccountPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireUser();
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Hesabım" subtitle={`${me.characterName} · @${me.username} · ${roleLabel[me.role]}`} />
      <Flash sp={sp} />
      <form action={changePassword} className="card max-w-md space-y-3">
        <h2 className="font-semibold">Şifre değiştir</h2>
        <div>
          <label className="label">Mevcut şifre</label>
          <input name="current" type="password" className="input" required autoComplete="current-password" />
        </div>
        <div>
          <label className="label">Yeni şifre</label>
          <input name="next" type="password" className="input" required minLength={6} autoComplete="new-password" />
        </div>
        <div>
          <label className="label">Yeni şifre (tekrar)</label>
          <input name="repeat" type="password" className="input" required minLength={6} autoComplete="new-password" />
        </div>
        <SubmitButton>Şifreyi değiştir</SubmitButton>
      </form>
    </>
  );
}
