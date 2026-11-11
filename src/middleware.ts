import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("session")?.value;
  let valid = false;
  if (token) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
      valid = true;
    } catch {}
  }
  const onLogin = req.nextUrl.pathname.startsWith("/login");
  if (!valid && !onLogin) return NextResponse.redirect(new URL("/login", req.url));
  // Não redireciona /login -> / aqui: o token pode ter assinatura válida mas o usuário não existir mais
  // (ou estar inativo / banco indisponível), o que causaria loop com o requireUser(). A página de login decide.
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
