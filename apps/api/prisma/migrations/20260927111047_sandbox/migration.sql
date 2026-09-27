-- CreateTable
CREATE TABLE "sandbox_state" (
    "id" INTEGER NOT NULL,
    "last_reset_at" TIMESTAMPTZ(3),
    "last_reset_status" TEXT,
    "last_reset_error" TEXT,
    "next_reset_at" TIMESTAMPTZ(3) NOT NULL,
    "locked_at" TIMESTAMPTZ(3),

    CONSTRAINT "sandbox_state_pkey" PRIMARY KEY ("id")
);
