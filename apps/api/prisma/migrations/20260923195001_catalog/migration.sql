-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SurfaceKind" AS ENUM ('NONE', 'FLOOR', 'WALLS', 'CEILING');

-- CreateEnum
CREATE TYPE "ProductUnit" AS ENUM ('SQM', 'LINEAR_M', 'PIECE');

-- CreateEnum
CREATE TYPE "OptionUnit" AS ENUM ('PIECE', 'ROOM_SQM', 'ROOM', 'PROJECT');

-- CreateEnum
CREATE TYPE "OptionKind" AS ENUM ('ENGINEERING', 'ADDITIONAL');

-- CreateEnum
CREATE TYPE "RoomTypeCode" AS ENUM ('LIVING_ROOM', 'BEDROOM', 'KITCHEN', 'KITCHEN_LIVING', 'BATHROOM');

-- CreateTable
CREATE TABLE "room_types" (
    "id" UUID NOT NULL,
    "code" "RoomTypeCode" NOT NULL,
    "name" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "revision" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "room_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" JSONB NOT NULL,
    "waste_percent" DECIMAL(5,2) NOT NULL,
    "surface" "SurfaceKind" NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_type_categories" (
    "room_type_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "room_type_categories_pkey" PRIMARY KEY ("room_type_id","category_id")
);

-- CreateTable
CREATE TABLE "material_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "material_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "material_type_id" UUID NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB NOT NULL,
    "brand" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "color" JSONB NOT NULL,
    "size" JSONB NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "unit" "ProductUnit" NOT NULL,
    "waste_percent_override" DECIMAL(5,2),
    "heated_floor_compatible" BOOLEAN NOT NULL DEFAULT false,
    "texture_image_id" UUID,
    "tile_width_mm" INTEGER,
    "tile_length_mm" INTEGER,
    "fallback_color" TEXT,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "product_id" UUID NOT NULL,
    "image_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("product_id","image_id")
);

-- CreateTable
CREATE TABLE "product_attributes" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" JSONB NOT NULL,
    "value" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "product_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "images" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "format" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,

    CONSTRAINT "images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "styles" (
    "id" UUID NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB NOT NULL,
    "image_id" UUID,
    "sort_order" INTEGER NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "styles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_default_materials" (
    "style_id" UUID NOT NULL,
    "room_type_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,

    CONSTRAINT "style_default_materials_pkey" PRIMARY KEY ("style_id","room_type_id","category_id")
);

-- CreateTable
CREATE TABLE "engineering_package_items" (
    "id" UUID NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB NOT NULL,
    "included_in_base" BOOLEAN NOT NULL,
    "price_cents" INTEGER,
    "unit" "OptionUnit",
    "sort_order" INTEGER NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "engineering_package_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "options" (
    "id" UUID NOT NULL,
    "kind" "OptionKind" NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB NOT NULL,
    "image_id" UUID,
    "price_cents" INTEGER NOT NULL,
    "unit" "OptionUnit" NOT NULL,
    "min_quantity" INTEGER,
    "max_quantity" INTEGER,
    "sort_order" INTEGER NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option_room_types" (
    "option_id" UUID NOT NULL,
    "room_type_id" UUID NOT NULL,

    CONSTRAINT "option_room_types_pkey" PRIMARY KEY ("option_id","room_type_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "room_types_code_key" ON "room_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "room_type_categories_room_type_id_sort_order_key" ON "room_type_categories"("room_type_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "material_types_code_key" ON "material_types"("code");

-- CreateIndex
CREATE INDEX "products_category_id_status_idx" ON "products"("category_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "product_images_product_id_key" ON "product_images"("product_id") WHERE ("is_primary" = true);

-- CreateIndex
CREATE INDEX "product_attributes_product_id_idx" ON "product_attributes"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "images_public_id_key" ON "images"("public_id");

-- CreateIndex
CREATE INDEX "style_default_materials_product_id_idx" ON "style_default_materials"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "options_kind_sort_order_key" ON "options"("kind", "sort_order");

-- AddForeignKey
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_type_categories" ADD CONSTRAINT "room_type_categories_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_type_categories" ADD CONSTRAINT "room_type_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_types" ADD CONSTRAINT "material_types_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_material_type_id_fkey" FOREIGN KEY ("material_type_id") REFERENCES "material_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_texture_image_id_fkey" FOREIGN KEY ("texture_image_id") REFERENCES "images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "images"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attributes" ADD CONSTRAINT "product_attributes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "styles" ADD CONSTRAINT "styles_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "styles" ADD CONSTRAINT "styles_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_default_materials" ADD CONSTRAINT "style_default_materials_style_id_fkey" FOREIGN KEY ("style_id") REFERENCES "styles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_default_materials" ADD CONSTRAINT "style_default_materials_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_default_materials" ADD CONSTRAINT "style_default_materials_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_default_materials" ADD CONSTRAINT "style_default_materials_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_package_items" ADD CONSTRAINT "engineering_package_items_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "options" ADD CONSTRAINT "options_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "options" ADD CONSTRAINT "options_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_room_types" ADD CONSTRAINT "option_room_types_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_room_types" ADD CONSTRAINT "option_room_types_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraint
ALTER TABLE "categories" ADD CONSTRAINT "categories_waste_percent_check" CHECK ("waste_percent" >= 0 AND "waste_percent" <= 100);

-- CheckConstraint
ALTER TABLE "products" ADD CONSTRAINT "products_price_cents_check" CHECK ("price_cents" >= 0);

-- CheckConstraint
ALTER TABLE "products" ADD CONSTRAINT "products_waste_percent_override_check" CHECK ("waste_percent_override" IS NULL OR ("waste_percent_override" >= 0 AND "waste_percent_override" <= 100));

-- CheckConstraint
ALTER TABLE "products" ADD CONSTRAINT "products_tile_width_mm_check" CHECK ("tile_width_mm" IS NULL OR "tile_width_mm" > 0);

-- CheckConstraint
ALTER TABLE "products" ADD CONSTRAINT "products_tile_length_mm_check" CHECK ("tile_length_mm" IS NULL OR "tile_length_mm" > 0);

-- CheckConstraint
ALTER TABLE "products" ADD CONSTRAINT "products_fallback_color_check" CHECK ("fallback_color" IS NULL OR "fallback_color" ~ '^#[0-9A-F]{6}$');

-- CheckConstraint
ALTER TABLE "engineering_package_items" ADD CONSTRAINT "engineering_package_items_price_cents_check" CHECK ("price_cents" IS NULL OR "price_cents" >= 0);

-- CheckConstraint
ALTER TABLE "options" ADD CONSTRAINT "options_price_cents_check" CHECK ("price_cents" >= 0);

-- CheckConstraint
ALTER TABLE "options" ADD CONSTRAINT "options_min_quantity_check" CHECK ("min_quantity" IS NULL OR ("min_quantity" >= 1 AND "min_quantity" <= 100));

-- CheckConstraint
ALTER TABLE "options" ADD CONSTRAINT "options_max_quantity_check" CHECK ("max_quantity" IS NULL OR ("max_quantity" >= 1 AND "max_quantity" <= 100));

-- CheckConstraint
ALTER TABLE "options" ADD CONSTRAINT "options_min_max_quantity_check" CHECK ("min_quantity" IS NULL OR "max_quantity" IS NULL OR "min_quantity" <= "max_quantity");
