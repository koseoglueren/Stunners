"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="space-y-4">
      {state && <div className="rounded-lg border border-blood/50 bg-blood/15 px-3 py-2 text-sm text-red-200">{state.error}</div>}
      <div>
        <label className="label" htmlFor="username">Kullanıcı adı</label>
        <input id="username" name="username" key={state?.username} defaultValue={state?.username} className="input" autoComplete="username" autoCapitalize="none" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Şifre</label>
        <input id="password" name="password" type="password" className="input" autoComplete="current-password" required autoFocus={!!state} />
      </div>
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Giriş yapılıyor..." : "Giriş yap"}
      </button>
    </form>
  );
}
