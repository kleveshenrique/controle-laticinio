import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

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
    },
  });

  for (const name of ["Leite / matéria-prima", "Embalagens", "Energia", "Combustível", "Folha de pagamento", "Manutenção", "Impostos", "Outros"]) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }

  await prisma.cashRegister.upsert({ where: { name: "Caixa Principal" }, update: {}, create: { name: "Caixa Principal" } });
  console.log(`Admin: ${email}`);
}

main().finally(() => prisma.$disconnect());
