-- CreateEnum
CREATE TYPE "PrinterStatus" AS ENUM ('ONLINE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "ConnectionType" AS ENUM ('LAPTOP_AGENT', 'RASPBERRY_PI');

-- CreateEnum
CREATE TYPE "ColorMode" AS ENUM ('BW', 'COLOUR');

-- CreateEnum
CREATE TYPE "PrintStatus" AS ENUM ('CREATED', 'UPLOADED', 'PAYMENT_PENDING', 'PAID', 'QUEUED', 'DOWNLOADING', 'PRINTING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "Printer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "location" TEXT,
    "status" "PrinterStatus" NOT NULL DEFAULT 'OFFLINE',
    "connectionType" "ConnectionType" NOT NULL DEFAULT 'LAPTOP_AGENT',
    "capabilities" JSONB NOT NULL DEFAULT '{"colorModes":["BW"],"paperSizes":["A4"],"duplex":false}',
    "lastHeartbeat" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Printer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL,
    "printerId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "customerSessionId" TEXT NOT NULL,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "colorMode" "ColorMode" NOT NULL DEFAULT 'BW',
    "pageRange" TEXT NOT NULL DEFAULT 'all',
    "paperSize" TEXT NOT NULL DEFAULT 'A4',
    "price" INTEGER NOT NULL DEFAULT 0,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "printStatus" "PrintStatus" NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Printer_deviceId_key" ON "Printer"("deviceId");

-- CreateIndex
CREATE INDEX "PrintJob_printerId_printStatus_idx" ON "PrintJob"("printerId", "printStatus");

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
