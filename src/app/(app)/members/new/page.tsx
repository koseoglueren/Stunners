import { requireRole } from "@/lib/auth";
import type { SearchParams } from "@/lib/forms";
import { PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/client";
import { MemberFields } from "../MemberFields";
import { createMember } from "../actions";

export const metadata = { title: "Üye ekle" };

export default async function NewMemberPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("LEADER");
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Üye ekle" subtitle="Üye bu kullanıcı adı ve şifreyle giriş yapar; şifresini sonra Hesabım sayfasından değiştirebilir." />
      <Flash sp={sp} />
      <form action={createMember} className="card max-w-2xl space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Kullanıcı adı</label>
            <input name="username" className="input" required autoCapitalize="none" placeholder="kucuk harf, bosluksuz" />
          </div>
          <div>
            <label className="label">İlk şifre</label>
            <input name="password" className="input" required minLength={6} />
          </div>
        </div>
        <MemberFields />
        <SubmitButton>Üyeyi kaydet</SubmitButton>
      </form>
    </>
  );
}
