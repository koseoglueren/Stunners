import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "stunners_session";
export const SESSION_DAYS = 30;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET en az 16 karakter olmalı");
  return new TextEncoder().encode(s);
}

export type TokenPayload = { uid: string; ver: string };

export async function signToken(payload: TokenPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifyToken(token: string | undefined): Promise<TokenPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.uid !== "string" || typeof payload.ver !== "string") return null;
    return { uid: payload.uid, ver: payload.ver };
  } catch {
    return null;
  }
}
