import express from "express";
import { env } from "./env";
import { systemsRouter } from "./systems/systems.routes";
import { instancesRouter } from "./instances/instances.routes";
import { flowsRouter } from "./flows/flows.routes";
import { messagingRouter } from "./messaging/messaging.routes";
import { webhookRouter } from "./webhook/webhook.routes";
import { adminRouter } from "./admin/admin.routes";
import { panelRouter } from "./panel/panel.routes";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "wpp-ai" });
});

// Raiz → painel (UX: abrir o domínio direto cai no painel).
app.get("/", (_req, res) => {
  res.redirect("/panel");
});

app.use(panelRouter); // /panel (HTML)
app.use(systemsRouter); // /admin/systems
app.use(adminRouter); // /admin/instances, /admin/flows
app.use(instancesRouter); // /v1/instances/*
app.use(flowsRouter); // /v1/flows
app.use(messagingRouter); // /v1/messages
app.use(webhookRouter); // /webhooks/evolution/:instanceName

app.listen(env.PORT, () => {
  console.log(`[wpp-ai] ouvindo na porta ${env.PORT}`);
});
