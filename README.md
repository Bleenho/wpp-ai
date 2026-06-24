# wpp-ai

Serviço de orquestração de **WhatsApp** (via [Evolution API](https://doc.evolution-api.com))
com **motor de conversa** e **fluxos configuráveis**, compartilhado por vários sistemas.

O `wpp-ai` é a "inteligência" de WhatsApp: conecta o número de cada negócio por QR,
recebe as mensagens, roda a máquina de estado dos fluxos e **executa as ações chamando de
volta o sistema** consumidor (ex.: Agendota) via HTTP assinado por HMAC.

```
            ┌─────────────┐   QR / enviar    ┌──────────────┐
 Cliente ⇄ │ Evolution   │ ───────────────► │              │
  (Zap)     │  API        │ ◄─ webhook ───── │   wpp-ai     │
            └─────────────┘  (msg recebida)  │  (este repo) │
                                             │              │
   ┌────────────────────────────────────────┤  motor de    │
   │ callback HMAC (executar ações):         │  conversa +  │
   │  /services /slots /clients /bookings ...│  fluxos      │
   ▼                                         └──────┬───────┘
┌──────────────┐   disparo de saída (confirmação/lembrete)  │
│  Sistema     │ ◄───────────────────────────────────────── ┘
│ (Agendota…)  │      POST /v1/messages  (o sistema agenda)
└──────────────┘
```

## Divisão de responsabilidades

| | wpp-ai | Sistema (Agendota) |
|---|---|---|
| Conexão Evolution / QR / enviar / receber | ✅ | |
| Máquina de conversa (sessão, menu, TTL) | ✅ | |
| Config dos fluxos (liga/desliga, mensagem, antecedência) | ✅ | |
| Dados de agendamento, clientes, política | | ✅ |
| Quando disparar confirmação/lembrete (cron) | | ✅ |
| Executar a ação (criar/remarcar/cancelar) | chama → | ✅ implementa |

## Fluxos suportados
`CONFIRMATION` (ativo, espera resposta), `REMINDER` (só saída), `SALE`, `RESCHEDULE`,
`CANCELLATION`. Robô em **menu numérico** (sem IA). Cancelar oferece remarcar antes;
remarcar pede data e devolve horários+profissionais.

## API (consumida pelo sistema, header `x-api-key`)

- `POST /v1/instances/connect` `{ tenantRef, businessName?, timezone? }` → `{ status, qrCode }`
- `GET  /v1/instances/status?tenantRef=…[&refresh=1]` → `{ status, phoneNumber, qrCode }`
- `DELETE /v1/instances` `{ tenantRef }`
- `GET  /v1/flows?tenantRef=…` → lista das 5 configs
- `PUT  /v1/flows` `{ tenantRef, flow, enabled?, messageTpl?, hoursBefore? }`
- `POST /v1/messages` `{ flow: CONFIRMATION|REMINDER, tenantRef, clientPhone, clientId?, bookingId?, vars }`

Admin (header `x-admin-key`):
- `POST /admin/systems` `{ name, callbackUrl, callbackSecret }` → `{ id, apiKey }`

Webhook (Evolution): `POST /webhooks/evolution/:instanceName`.

## Contrato de callback (o SISTEMA precisa implementar)

Base = `system.callbackUrl`. Todas **POST**, corpo JSON com `tenantRef`. Cada requisição
traz o header `x-wppai-signature` = HMAC-SHA256(corpo, `callbackSecret`) — **valide-o**.

| Rota | Entrada | Saída |
|---|---|---|
| `/services` | `{tenantRef}` | `{ services: [{id,name,price,durationMin}] }` |
| `/slots` | `{tenantRef, serviceIds, date, professionalId?}` | `{ slots: [{iso, professionalId, professionalName}] }` |
| `/clients/find` | `{tenantRef, phone}` | `{ client: {id,name}\|null }` |
| `/clients/create` | `{tenantRef, phone, name}` | `{ client: {id,name} }` |
| `/bookings/upcoming` | `{tenantRef, clientId}` | `{ bookings: [{id,label}] }` |
| `/bookings/create` | `{tenantRef, clientId, serviceIds, professionalId, startTime}` | `{ bookingId, checkoutUrl? }` |
| `/bookings/reschedule-slots` | `{tenantRef, bookingId, date}` | `{ slots: [...] }` |
| `/bookings/reschedule` | `{tenantRef, bookingId, startTime, professionalId}` | `{ ok, error? }` |
| `/bookings/cancel` | `{tenantRef, bookingId}` | `{ ok, refundLabel?, error? }` |
| `/bookings/confirm` | `{tenantRef, bookingId}` | `{ ok, error? }` |

Em erro de regra de negócio, responda `{ ok:false, error }` (ou status ≥400 com `{error}`)
— a mensagem é repassada ao cliente no WhatsApp.

Variáveis dos templates: `{cliente} {negocio} {servico} {profissional} {data} {hora} {valor} {link}`.

## Rodando

```bash
cp .env.example .env      # configure DATABASE_URL, EVOLUTION_API_URL/KEY, PUBLIC_URL, ADMIN_API_KEY
npm install
npm run db:push           # cria o schema no Postgres do wpp-ai
npm run dev               # http://localhost:8090/health
```

Requer uma **Evolution API** acessível e o `PUBLIC_URL` alcançável por ela (em dev, use um
túnel como ngrok/cloudflared para o webhook).

## Stack
Node + TypeScript + Express + Prisma/Postgres. Banco próprio, separado dos sistemas.
