import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { postgresUrlSchema } from '../../src/config/env';
import { PrismaClient } from '../../src/generated/prisma/client';
import { CatalogDatasetService } from '../../src/modules/catalog/dataset/catalog-dataset.service';
import { catalogDataset } from '../../src/modules/catalog/dataset/data';

const EXIT_FAILURE = 1;
const TRANSACTION_TIMEOUT_MS = 120_000;
const TRANSACTION_MAX_WAIT_MS = 30_000;

async function countCatalog(prisma: PrismaClient) {
  const [
    images,
    roomTypes,
    roomTypeCategories,
    materialTypes,
    categories,
    products,
    productImages,
    productAttributes,
    styles,
    styleDefaultMaterials,
    engineeringItems,
    options,
    optionRoomTypes,
  ] = await Promise.all([
    prisma.image.count(),
    prisma.roomType.count(),
    prisma.roomTypeCategory.count(),
    prisma.materialType.count(),
    prisma.category.count(),
    prisma.product.count(),
    prisma.productImage.count(),
    prisma.productAttribute.count(),
    prisma.style.count(),
    prisma.styleDefaultMaterial.count(),
    prisma.engineeringPackageItem.count(),
    prisma.option.count(),
    prisma.optionRoomType.count(),
  ]);

  return {
    images,
    roomTypes,
    roomTypeCategories,
    materialTypes,
    categories,
    products,
    productImages,
    productAttributes,
    styles,
    styleDefaultMaterials,
    engineeringItems,
    options,
    optionRoomTypes,
  };
}

async function main(): Promise<void> {
  const databaseUrl = postgresUrlSchema.safeParse(process.env.DATABASE_URL);

  if (!databaseUrl.success) {
    process.stderr.write(
      'Invalid or missing DATABASE_URL environment variable.\n',
    );
    process.exitCode = EXIT_FAILURE;
    return;
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl.data });
  const prisma = new PrismaClient({ adapter });
  const service = new CatalogDatasetService();

  try {
    await prisma.$transaction((tx) => service.upsert(catalogDataset, tx), {
      timeout: TRANSACTION_TIMEOUT_MS,
      maxWait: TRANSACTION_MAX_WAIT_MS,
    });

    const counts = await countCatalog(prisma);
    process.stdout.write('Catalog dataset applied.\n');
    for (const [table, count] of Object.entries(counts)) {
      process.stdout.write(`  ${table}: ${count}\n`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    const details = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Failed to seed the catalog.\n${details}\n`);
    process.exitCode = EXIT_FAILURE;
  });
}
