# Deploy do wpp-ai (VPS dedicado + Docker Compose)

Sobe, num único servidor: **Caddy** (TLS) + **wpp-ai** + **Evolution API** + 2 Postgres + Redis.
Só o Caddy fica exposto (80/443). Evolution e bancos ficam na rede interna do Docker.

## 1. Servidor e DNS
- Um VPS Ubuntu 22.04+ (comece com **2 vCPU / 4 GB**; cada número conectado usa ~50–150 MB de RAM).
- Instale Docker + Compose: `curl -fsSL https://get.docker.com | sh`
- Crie um registro **A**: `wa.seudominio.com → IP_DO_VPS`.

## 2. Configurar
```bash
git clone https://github.com/Bleenho/wpp-ai.git
cd wpp-ai/deploy
cp .env.example .env
# gere os segredos:
openssl rand -hex 32   # use para EVOLUTION_API_KEY
openssl rand -hex 32   # use para WPPAI_ADMIN_API_KEY
openssl rand -hex 16   # use para WPPAI_DB_PASSWORD e EVOLUTION_DB_PASSWORD
```
Preencha `deploy/.env` (inclusive `WPPAI_DOMAIN=wa.seudominio.com`).

## 3. Subir
```bash
docker compose up -d --build
docker compose run --rm wppai npx prisma db push   # cria o schema do wpp-ai (1x)
docker compose logs -f caddy wppai                  # acompanhe (TLS + boot)
```
Teste: `curl https://wa.seudominio.com/health` → `{"ok":true,"service":"wpp-ai"}`.

## 4. Registrar o Agendota como sistema
```bash
curl -X POST https://wa.seudominio.com/admin/systems \
  -H "x-admin-key: $WPPAI_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Agendota",
    "adapter": "agendota",
    "config": { "baseUrl": "https://SEU-AGENDOTA", "apiKey": "CHAVE_A" }
  }'
# resposta: { "data": { "id": "...", "apiKey": "wppai_xxx" } }  <- CHAVE_B
```

### Mapa de chaves (a parte que confunde)
| Chave | Onde define | Quem usa | Para quê |
|---|---|---|---|
| `EVOLUTION_API_KEY` | `deploy/.env` | wpp-ai ↔ Evolution (interno) | autentica na Evolution |
| `WPPAI_ADMIN_API_KEY` | `deploy/.env` | você | criar/listar sistemas (`/admin/*`) |
| **CHAVE_A** | você escolhe | wpp-ai → Agendota | bate com `WPP_INTEGRATION_API_KEY` do Agendota. Vai em `config.apiKey` ao registrar o sistema **e** no `.env` do Agendota |
| **CHAVE_B** (`wppai_...`) | retornada pelo `/admin/systems` | Agendota → wpp-ai | é o `x-api-key` que o Agendota usa nas rotas `/v1/*` |

No **Agendota**, defina `WPP_INTEGRATION_API_KEY=CHAVE_A` e guarde a `CHAVE_B` + a URL
`https://wa.seudominio.com` para a tela `/admin/whatsapp` chamar o wpp-ai (reapontamento pendente).

## 5. Conectar um número (teste antes da UI)
```bash
# inicia a instância do salão (tenantRef = slug do negócio no Agendota) e devolve o QR (base64)
curl -X POST https://wa.seudominio.com/v1/instances/connect \
  -H "x-api-key: CHAVE_B" -H "Content-Type: application/json" \
  -d '{ "tenantRef": "meu-salao", "businessName": "Meu Salão", "timezone": "America/Sao_Paulo" }'
# salve o base64 do QR e abra para escanear, ou consulte:
curl "https://wa.seudominio.com/v1/instances/status?tenantRef=meu-salao" -H "x-api-key: CHAVE_B"
```
Escaneie com o WhatsApp do salão → status vira `CONNECTED`.

## 6. Disparos (confirmação/lembrete)
O Agendota (que tem o agendador) chama, no horário certo:
```
POST https://wa.seudominio.com/v1/messages   (x-api-key: CHAVE_B)
{ "flow":"CONFIRMATION", "tenantRef":"meu-salao", "clientPhone":"5511...",
  "clientId":"...", "bookingId":"...", "vars": { "cliente":"...", "data":"...", ... } }
```

## Operação
- **Logs:** `docker compose logs -f wppai evolution`
- **Atualizar:** `git pull && docker compose up -d --build`
- **Backup:** volumes `wppai_db_data`, `evolution_db_data`, `evolution_instances` (este guarda as
  sessões conectadas — sem ele, todos reescaneiam o QR).
- **Escala:** monitore RAM; suba para 8 GB conforme o nº de instâncias conectadas crescer.
- **Risco de ban:** Baileys é não-oficial. Ritmo de envio moderado, respeite opt-out (`parar`).
