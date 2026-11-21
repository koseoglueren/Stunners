import { LogoMark } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Giriş" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark size={88} />
          <h1 className="mt-4 font-display text-3xl font-bold tracking-[0.25em] text-gold">STUNNERS</h1>
          <p className="mt-1 text-xs tracking-[0.35em] text-mute uppercase">Clan Farm Paylaşım</p>
        </div>
        <div className="card">
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-mute">Hesabın yoksa clan liderinden iste.</p>
      </div>
    </main>
  );
}
