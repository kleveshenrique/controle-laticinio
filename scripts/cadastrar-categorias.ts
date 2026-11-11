/**
 * Cadastra o plano de contas gerencial (prisma/categorias.ts) num banco já existente, sem resetar.
 * (O npm run db:reset já cria essas categorias pelo seed.)
 * Pode ser rodado várias vezes: categorias que já existem não são duplicadas
 * (são apenas reativadas, caso estejam inativas).
 *
 * Uso:  npm run db:categorias
 *       npm run db:categorias -- --desativar-antigas
 *         (também desativa as categorias genéricas antigas, como "Energia" e "Outros";
 *          elas não são apagadas, então as contas já lançadas continuam com a categoria)
 */
import { PrismaClient } from "@prisma/client";
import { CATEGORIAS } from "../prisma/categorias";

const prisma = new PrismaClient();

/** Categorias genéricas que o prisma/seed.ts criava antes do plano de contas. */
const ANTIGAS = ["Leite / matéria-prima", "Embalagens", "Energia", "Combustível", "Folha de pagamento", "Manutenção", "Impostos", "Outros"];

async function main() {
  let criadas = 0;
  let reativadas = 0;
  for (const name of CATEGORIAS) {
    const existente = await prisma.category.findUnique({ where: { name } });
    if (!existente) {
      await prisma.category.create({ data: { name } });
      criadas++;
    } else if (!existente.active) {
      await prisma.category.update({ where: { name }, data: { active: true } });
      reativadas++;
    }
  }
  console.log(`✔ ${criadas} categoria(s) criada(s), ${reativadas} reativada(s), ${CATEGORIAS.length - criadas - reativadas} já existia(m).`);

  if (process.argv.includes("--desativar-antigas")) {
    const { count } = await prisma.category.updateMany({ where: { name: { in: ANTIGAS }, active: true }, data: { active: false } });
    console.log(`✔ ${count} categoria(s) antiga(s) desativada(s).`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
