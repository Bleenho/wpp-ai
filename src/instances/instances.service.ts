import { prisma } from "../db";
import { env } from "../env";
import {
  isConfigured,
  createInstance,
  connectInstance,
  connectionState,
  logoutInstance,
  deleteInstance,
} from "../evolution/client";

export interface InstanceStatus {
  status: "DISCONNECTED" | "CONNECTING" | "CONNECTED";
  phoneNumber: string | null;
  qrCode: string | null;
  configured: boolean;
}

function webhookUrl(instanceName: string): string {
  return `${env.PUBLIC_URL.replace(/\/+$/, "")}/webhooks/evolution/${encodeURIComponent(instanceName)}`;
}

function makeInstanceName(systemId: string, tenantRef: string): string {
  return `${systemId}_${tenantRef}`.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

interface ConnectOpts {
  businessName?: string;
  timezone?: string;
}

/** Inicia (ou reinicia) a conexão e devolve o QR. */
export async function connect(
  systemId: string,
  tenantRef: string,
  opts: ConnectOpts = {},
): Promise<InstanceStatus> {
  if (!isConfigured()) throw new Error("Evolution API não configurada no servidor.");

  const existing = await prisma.instance.findUnique({
    where: { systemId_tenantRef: { systemId, tenantRef } },
  });
  const instanceName = existing?.instanceName ?? makeInstanceName(systemId, tenantRef);

  try {
    await createInstance(instanceName, webhookUrl(instanceName));
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (!/already in use|exists/i.test(msg)) console.error("[instances] createInstance:", msg);
  }

  const qr = await connectInstance(instanceName);

  const row = await prisma.instance.upsert({
    where: { systemId_tenantRef: { systemId, tenantRef } },
    create: {
      systemId,
      tenantRef,
      instanceName,
      businessName: opts.businessName ?? null,
      timezone: opts.timezone ?? "America/Sao_Paulo",
      status: "CONNECTING",
      lastQrCode: qr.base64 ?? null,
    },
    update: {
      status: "CONNECTING",
      lastQrCode: qr.base64 ?? null,
      ...(opts.businessName ? { businessName: opts.businessName } : {}),
      ...(opts.timezone ? { timezone: opts.timezone } : {}),
    },
  });

  return statusOf(row);
}

export async function status(systemId: string, tenantRef: string): Promise<InstanceStatus> {
  const row = await prisma.instance.findUnique({ where: { systemId_tenantRef: { systemId, tenantRef } } });
  return statusOf(row);
}

/** Sincroniza com a Evolution (fallback se o webhook de conexão se perder). */
export async function refresh(systemId: string, tenantRef: string): Promise<InstanceStatus> {
  const row = await prisma.instance.findUnique({ where: { systemId_tenantRef: { systemId, tenantRef } } });
  if (!row) return statusOf(null);
  const state = await connectionState(row.instanceName);
  if (state === "open" && row.status !== "CONNECTED") {
    await prisma.instance.update({
      where: { id: row.id },
      data: { status: "CONNECTED", connectedAt: new Date(), lastQrCode: null },
    });
  } else if (state === "close" && row.status !== "DISCONNECTED") {
    await prisma.instance.update({ where: { id: row.id }, data: { status: "DISCONNECTED" } });
  }
  return status(systemId, tenantRef);
}

export async function disconnect(systemId: string, tenantRef: string): Promise<void> {
  const row = await prisma.instance.findUnique({ where: { systemId_tenantRef: { systemId, tenantRef } } });
  if (!row) return;
  await logoutInstance(row.instanceName);
  await deleteInstance(row.instanceName);
  await prisma.instance.update({
    where: { id: row.id },
    data: { status: "DISCONNECTED", lastQrCode: null, phoneNumber: null, connectedAt: null },
  });
}

function statusOf(row: {
  status: "DISCONNECTED" | "CONNECTING" | "CONNECTED";
  phoneNumber: string | null;
  lastQrCode: string | null;
} | null): InstanceStatus {
  return {
    status: row?.status ?? "DISCONNECTED",
    phoneNumber: row?.phoneNumber ?? null,
    qrCode: row?.lastQrCode ?? null,
    configured: isConfigured(),
  };
}
