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

**Painel admin (web):** `GET /panel` — tela única (pede a `x-admin-key`) p/ ver
sistemas, conexões (status) e ligar/editar os fluxos de cada salão num lugar só.

Admin (header `x-admin-key`):
- `POST /admin/systems` → `{ id, apiKey }`. Corpo conforme o adaptador:
  - generic: `{ name, adapter:"generic", callbackUrl, callbackSecret }`
  - agendota: `{ name, adapter:"agendota", config:{ baseUrl, apiKey } }`
- `GET /admin/systems` · `GET /admin/instances` · `GET/PUT /admin/flows` (usados pelo painel)

Webhook (Evolution): `POST /webhooks/evolution/:instanceName`.

## Adaptadores (como o wpp-ai fala com cada sistema)

O motor usa a interface interna `SystemPort` (`src/conversation/ports.ts`). Cada sistema tem
um ADAPTADOR — assim o wpp-ai roda separado e só conhece a porta, não os detalhes do sistema.
`tenantRef` identifica o negócio dentro do sistema.

### Adaptador `generic` (contrato neutro — o sistema implementa)
Base = `callbackUrl`. Todas **POST**, corpo JSON com `tenantRef`, header
`x-wppai-signature` = HMAC-SHA256(corpo, `callbackSecret`) — **valide-o**.

| Rota | Entrada | Saída |
|---|---|---|
| `/services` | `{tenantRef}` | `{ services:[{id,name,price,durationMin}] }` |
| `/slots` | `{tenantRef, serviceIds, date, professionalId?}` | `{ slots:[{iso,professionalId,professionalName}] }` |
| `/clients/find` | `{tenantRef, phone}` | `{ client:{id,name}\|null }` |
| `/clients/create` | `{tenantRef, phone, name}` | `{ client:{id,name} }` |
| `/bookings/upcoming` | `{tenantRef, clientId}` | `{ bookings:[{id,label}] }` |
| `/bookings/create` | `{tenantRef, clientId, serviceIds, professionalId, startTime}` | `{ bookingId, checkoutUrl? }` |
| `/bookings/reschedule-slots` | `{tenantRef, bookingId, date}` | `{ slots:[...] }` |
| `/bookings/reschedule` | `{tenantRef, bookingId, startTime, professionalId}` | `{ ok, error? }` |
| `/bookings/cancel` | `{tenantRef, bookingId}` | `{ ok, refundLabel?, error? }` |
| `/bookings/confirm` | `{tenantRef, bookingId}` | `{ ok, error? }` |

### Adaptador `agendota` (usa a API que o Agendota JÁ tem)
`tenantRef` = **slug** do negócio. `config = { baseUrl, apiKey }`.

- **Leituras** reusam a API pública existente (sem mudar nada no Agendota):
  - `GET /api/public/{slug}/services`
  - `GET /api/public/{slug}/availability?date=&serviceIds=&professionalId=`
- **Escritas + lookup por telefone** NÃO cabem na API pública atual (protegida por OTP de
  e-mail / token assinado — segurança de navegador). Precisam de um endpoint **confiável**
  (header `x-api-key`) a adicionar no Agendota, base `/api/integrations/wpp/{slug}`:
  `GET /clients?phone=`, `POST /clients`, `GET /bookings/upcoming?clientId=`,
  `POST /bookings`, `GET /bookings/reschedule-slots?bookingId=&date=`,
  `POST /bookings/reschedule`, `POST /bookings/cancel`, `POST /bookings/confirm`.
  Esses são um wrapper fino por API-key sobre os services internos que o Agendota já tem
  (`createBooking`, `cancelBooking`, `rescheduleBookingByClient`, `findAvailableSlots`).

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
