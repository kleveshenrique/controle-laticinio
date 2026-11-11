import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { CATEGORIAS } from "./categorias";
import { TODAS_TELAS } from "../src/lib/telas";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@laticinio.local").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "troque-esta-senha";

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: "Administrador",
      email,
      passwordHash: await bcrypt.hash(password, 10),
      permissions: ["ADMIN", "LANCAR", "APROVAR", "PAGAR", "CAIXA"],
      telas: TODAS_TELAS,
    },
  });

  for (const name of CATEGORIAS) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }

  for (const name of ["Dinheiro", "Boleto", "Pix", "Promissória"]) {
    await prisma.paymentMethod.upsert({ where: { name }, update: {}, create: { name } });
  }

  for (const name of ["Caixa Principal", "Bradesco", "Brasil"]) {
    await prisma.cashRegister.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`Admin: ${email}`);
}

main().finally(() => prisma.$disconnect());
