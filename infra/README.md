# Infra AWS do wpp-ai (Terraform)

Sobe o wpp-ai + Evolution numa **EC2 t3.small** na **VPC compartilhada** (mesma do
agendota/fereoli), reusando o **RDS existente** com **schemas novos** (`wppai`,
`evolution`) — sem RDS novo. Público em **`wpp.agendota.com`** via Caddy (TLS).
O Agendota (mesma VPC) chama pelo IP **privado** `:8090`; o domínio é p/ acesso
externo/admin. Espelha o padrão de `agendota/infra/`.

## Custo estimado (us-east-1)
- EC2 t3.small (2 GB): ~US$15 · EBS 30 GB: ~US$2,4 · EIP/IP público: ~US$3,6 · RDS: +US$0 (reusa) → **~US$21/mês**.

## DNS
Depois do `apply`, pegue o output `wppai_eip` e crie: `A  wpp.agendota.com  ->  <EIP>`.
O Caddy emite o TLS automaticamente assim que o DNS propagar (ele fica tentando até resolver).

## Pré-requisitos
- AWS CLI configurado (mesma conta da fereoli/agendota).
- A VPC `fereoli-vpc`, a subnet `fereoli-public-subnet` e o RDS `fereoli-db` já existem.
- O SG do RDS já libera o CIDR da subnet pública (o agendota já usa) → esta EC2 alcança o RDS.
- Um PAT do GitHub com leitura do repo `Bleenho/wpp-ai`.

## Subir
```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # preencha (db_password, evolution_api_key, wppai_admin_api_key, github_pat, my_ip)
terraform init
terraform apply
```
Saídas úteis: `wppai_private_ip`, `wppai_url_for_agendota`, `ssh_command`.
O `user_data` instala Docker, cria os schemas, sobe a stack e roda `prisma db push`.
Acompanhe na EC2: `sudo tail -f /var/log/user_data.log`.

## Ligar com o Agendota
1. Registrar o sistema (de dentro da VPC, ex.: SSH na EC2 ou pela do agendota):
   ```bash
   curl -X POST http://<wppai_private_ip>:8090/admin/systems \
     -H "x-admin-key: $WPPAI_ADMIN_API_KEY" -H "Content-Type: application/json" \
     -d '{"name":"Agendota","adapter":"agendota",
          "config":{"baseUrl":"https://agendota.com","apiKey":"CHAVE_A"}}'
   # resposta: { "data": { "apiKey":"wppai_xxx" } }  -> CHAVE_B
   ```
2. No **Agendota** (`/opt/salao/.env` na EC2 dele), setar e redeployar:
   ```
   WPPAI_URL=http://<wppai_private_ip>:8090
   WPPAI_API_KEY=CHAVE_B
   WPP_INTEGRATION_API_KEY=CHAVE_A
   CONFIRMATION_HOURS_BEFORE=24
   ```

### Mapa de chaves
| Chave | Onde | Para quê |
|---|---|---|
| `evolution_api_key` | tfvars | wpp-ai ↔ Evolution (interno) |
| `wppai_admin_api_key` | tfvars | criar sistemas (`/admin/*`) |
| CHAVE_A | você escolhe | wpp-ai → Agendota (= `WPP_INTEGRATION_API_KEY` do Agendota; vai no `config.apiKey`) |
| CHAVE_B (`wppai_...`) | retornada do `/admin/systems` | Agendota → wpp-ai (`x-api-key` em `/v1/*`) |

## Notas
- Schemas: `wppai` (tabelas do wpp-ai) e `evolution` (Evolution) ficam no database `${db_name}`
  (default `agendota`), isolados do schema `public` do app. Mude `db_name` se preferir outro.
- Atualizar o serviço: `ssh` na EC2 → `cd /opt/wppai && git pull && docker compose -f deploy/docker-compose.aws.yml up -d --build`.
- Sem domínio/TLS: o tráfego Agendota↔wpp-ai é interno na VPC.
