import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { envSchema, postgresUrlSchema } from '../../src/config/env';
import { PrismaClient } from '../../src/generated/prisma/client';
import { CatalogDatasetService } from '../../src/modules/catalog/dataset/catalog-dataset.service';
import { catalogDataset } from '../../src/modules/catalog/dataset/data';
import { pricingDataset } from '../../src/modules/pricing/dataset/data';
import { PricingDatasetService } from '../../src/modules/pricing/dataset/pricing-dataset.service';
import { seedDemoAdmin } from './admins';
import { seedProjectsSettings } from './projects-settings';

const EXIT_FAILURE = 1;
const TRANSACTION_TIMEOUT_MS = 120_000;
const TRANSACTION_MAX_WAIT_MS = 30_000;

const demoAdminEnvSchema = envSchema.pick({
  DEMO_ADMIN_LOGIN: true,
  DEMO_ADMIN_PASSWORD: true,
});

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

async function countPricing(prisma: PrismaClient) {
  const [baseRates, coefficients, pricingRules] = await Promise.all([
    prisma.baseRate.count(),
    prisma.coefficient.count(),
    prisma.pricingRule.count(),
  ]);

  return { baseRates, coefficients, pricingRules };
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

  const demoAdminEnv = demoAdminEnvSchema.safeParse(process.env);

  if (!demoAdminEnv.success) {
    process.stderr.write(
      'Invalid or missing DEMO_ADMIN_LOGIN/DEMO_ADMIN_PASSWORD environment variables.\n',
    );
    process.exitCode = EXIT_FAILURE;
    return;
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl.data });
  const prisma = new PrismaClient({ adapter });
  const service = new CatalogDatasetService();
  const pricingService = new PricingDatasetService();

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

    await prisma.$transaction(
      (tx) => pricingService.upsert(pricingDataset, tx),
      {
        timeout: TRANSACTION_TIMEOUT_MS,
        maxWait: TRANSACTION_MAX_WAIT_MS,
      },
    );

    const pricingCounts = await countPricing(prisma);
    process.stdout.write('Pricing dataset applied.\n');
    for (const [table, count] of Object.entries(pricingCounts)) {
      process.stdout.write(`  ${table}: ${count}\n`);
    }

    await seedProjectsSettings(prisma);
    process.stdout.write('Projects settings ensured.\n');

    await seedDemoAdmin(prisma, {
      login: demoAdminEnv.data.DEMO_ADMIN_LOGIN,
      password: demoAdminEnv.data.DEMO_ADMIN_PASSWORD,
    });
    process.stdout.write(
      `Demo admin ensured: ${demoAdminEnv.data.DEMO_ADMIN_LOGIN}\n`,
    );
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
