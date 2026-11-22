import { Logo } from "@/components/Logo";
import { MobileMenu, NavLink } from "@/components/client";
import { hasRole, requireUser } from "@/lib/auth";
import { roleLabel } from "@/lib/format";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const nav = (
    <nav className="flex flex-col gap-1">
      <NavLink href="/">Ana panel</NavLink>
      <NavLink href="/farms">Farm oturumları</NavLink>
      <NavLink href="/settlements">Gün sonu hesapları</NavLink>
      <NavLink href="/transfers">Ödemeler</NavLink>
      <NavLink href="/vault">Clan kasası</NavLink>
      <NavLink href="/reports">Raporlar</NavLink>
      <NavLink href="/members">Üyeler</NavLink>
      <NavLink href="/items">Item kataloğu</NavLink>
      {hasRole(user, "LEADER") && <NavLink href="/settings">Ayarlar</NavLink>}
      <NavLink href="/account">Hesabım</NavLink>
    </nav>
  );
  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-panel/70 p-4 backdrop-blur lg:flex">
        <div className="mb-8 px-1">
          <Logo uid="side" />
        </div>
        {nav}
        <div className="mt-auto rounded-lg border border-line bg-panel-2 p-3 text-sm">
          <div className="font-medium">{user.characterName}</div>
          <div className="text-xs text-mute">
            @{user.username} · {roleLabel[user.role]}
          </div>
          <form action={logout} className="mt-2">
            <button className="text-xs text-mute hover:text-red-300">Çıkış yap</button>
          </form>
        </div>
      </aside>
      <header className="relative flex h-16 items-center justify-between border-b border-line bg-panel/80 px-4 lg:hidden">
        <Logo uid="mobile" />
        <MobileMenu>
          {nav}
          <form action={logout} className="mt-2 border-t border-line pt-2">
            <button className="px-3 text-sm text-mute">Çıkış yap ({user.characterName})</button>
          </form>
        </MobileMenu>
      </header>
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}
