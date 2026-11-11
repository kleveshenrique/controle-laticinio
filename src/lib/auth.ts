import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./db";
import { UserError } from "./errors";
import type { PermissionName } from "./permissions";
import { podeVerTela, telaInicial, TELAS, type TelaKey } from "./telas";

const COOKIE = "session";
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET);

export async function createSession(userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setExpirationTime("7d")
    .sign(secret());
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function destroySession() {
  cookies().delete(COOKIE);
}

/** Usuário logado (permissões sempre lidas do banco, então mudanças valem na hora). */
export const getUser = cache(async () => {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const user = await prisma.user.findUnique({ where: { id: String(payload.sub) } });
    return user?.active ? user : null;
  } catch {
    return null;
  }
});

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export function can(user: { permissions: string[] }, p: PermissionName) {
  return user.permissions.includes(p) || user.permissions.includes("ADMIN");
}

export async function requirePermission(p: PermissionName) {
  const user = await requireUser();
  if (!can(user, p)) throw new UserError("Você não tem permissão para esta ação.");
  return user;
}

/**
 * Bloqueia a tela se o usuário não tiver acesso a ela (User.telas + permissão da tela):
 * manda para a primeira tela liberada com a mensagem de erro (ou para "/", que mostra o aviso de sem acesso).
 */
export function exigirTela(user: { permissions: string[]; telas: string[] }, key: TelaKey) {
  if (podeVerTela(user, key)) return;
  const tela = TELAS.find((t) => t.key === key)!;
  redirect((telaInicial(user) ?? "/") + "?erro=" + encodeURIComponent(`Você não tem acesso à tela ${tela.label}.`));
}
