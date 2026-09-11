-- CreateEnum
CREATE TYPE "InstanceStatus" AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED');

-- CreateEnum
CREATE TYPE "Flow" AS ENUM ('CONFIRMATION', 'REMINDER', 'BIRTHDAY', 'SALE', 'RESCHEDULE', 'CANCELLATION');

-- CreateTable
CREATE TABLE "systems" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "adapter" TEXT NOT NULL DEFAULT 'generic',
    "config" JSONB NOT NULL DEFAULT '{}',
    "callbackUrl" TEXT,
    "callbackSecret" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isCentral" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instances" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "tenantRef" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "businessName" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "autoReply" BOOLEAN NOT NULL DEFAULT false,
    "status" "InstanceStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "phoneNumber" TEXT,
    "lastQrCode" TEXT,
    "connectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_configs" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "tenantRef" TEXT NOT NULL,
    "flow" "Flow" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "messageTpl" TEXT NOT NULL,
    "hoursBefore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flow_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "tenantRef" TEXT NOT NULL,
    "clientPhone" TEXT NOT NULL,
    "clientId" TEXT,
    "flow" "Flow",
    "step" TEXT NOT NULL DEFAULT '',
    "context" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_messages" (
    "id" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_sends" (
    "id" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "toPhone" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'MESSAGE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_sends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "systems_apiKey_key" ON "systems"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "instances_instanceName_key" ON "instances"("instanceName");

-- CreateIndex
CREATE UNIQUE INDEX "instances_systemId_tenantRef_key" ON "instances"("systemId", "tenantRef");

-- CreateIndex
CREATE INDEX "flow_configs_systemId_tenantRef_idx" ON "flow_configs"("systemId", "tenantRef");

-- CreateIndex
CREATE UNIQUE INDEX "flow_configs_systemId_tenantRef_flow_key" ON "flow_configs"("systemId", "tenantRef", "flow");

-- CreateIndex
CREATE INDEX "conversations_systemId_tenantRef_idx" ON "conversations"("systemId", "tenantRef");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_systemId_tenantRef_clientPhone_key" ON "conversations"("systemId", "tenantRef", "clientPhone");

-- CreateIndex
CREATE INDEX "inbound_messages_createdAt_idx" ON "inbound_messages"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_messages_instanceName_messageId_key" ON "inbound_messages"("instanceName", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_sends_idempotencyKey_key" ON "outbound_sends"("idempotencyKey");

-- CreateIndex
CREATE INDEX "outbound_sends_instanceName_toPhone_createdAt_idx" ON "outbound_sends"("instanceName", "toPhone", "createdAt");

-- CreateIndex
CREATE INDEX "outbound_sends_createdAt_idx" ON "outbound_sends"("createdAt");

-- AddForeignKey
ALTER TABLE "instances" ADD CONSTRAINT "instances_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_configs" ADD CONSTRAINT "flow_configs_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

