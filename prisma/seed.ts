import bcrypt from "bcryptjs";
import { PrismaClient, type LootCategory } from "@prisma/client";

const prisma = new PrismaClient();

const LOCATIONS = [
  "Moradon",
  "Ronark Land",
  "Ronark Land Base",
  "Ardream",
  "Eslant",
  "Krowaz Dominion",
  "Bifrost",
  "Juraid Mountain",
  "Forgotten Temple",
  "Diğer",
];

const ITEMS: [string, LootCategory][] = [
  ["Upgrade Scroll (Low Class)", "SCROLL"],
  ["Upgrade Scroll (Middle Class)", "SCROLL"],
  ["Upgrade Scroll (High Class)", "SCROLL"],
  ["Blessed Upgrade Scroll", "SCROLL"],
  ["Trina's Piece", "SCROLL"],
  ["Chaos Stone", "MATERIAL"],
  ["Dragon Scale", "MATERIAL"],
  ["Gem", "MATERIAL"],
];

async function main() {
  // Runs on every deploy; only fills empty tables, never overwrites data.
  if ((await prisma.user.count()) === 0) {
    const username = (process.env.ADMIN_USERNAME ?? "").trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD ?? "";
    if (!username || password.length < 6) {
      console.warn("seed: ADMIN_USERNAME / ADMIN_PASSWORD (6+ karakter) ayarlanmadı, ilk lider oluşturulmadı.");
    } else {
      await prisma.user.create({
        data: {
          username,
          passwordHash: await bcrypt.hash(password, 10),
          characterName: process.env.ADMIN_CHARACTER || username,
          role: "LEADER",
        },
      });
      console.log(`seed: ilk lider oluşturuldu: ${username}`);
    }
  }
  if ((await prisma.farmLocation.count()) === 0) {
    await prisma.farmLocation.createMany({ data: LOCATIONS.map((name) => ({ name })) });
    console.log("seed: farm yerleri eklendi");
  }
  if ((await prisma.itemCatalog.count()) === 0) {
    await prisma.itemCatalog.createMany({ data: ITEMS.map(([name, category]) => ({ name, category })) });
    console.log("seed: item kataloğu eklendi");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
