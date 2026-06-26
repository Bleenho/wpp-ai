#!/bin/bash
set -e
exec > /var/log/user_data.log 2>&1
echo "=== Inicio setup wpp-ai: $(date) ==="

APP_DIR=/opt/wppai

# ============================================
# 1. Swap 2GB (evita OOM no build em t3.small)
# ============================================
echo ">>> Criando swap de 2GB..."
dd if=/dev/zero of=/swapfile bs=128M count=16
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile swap swap defaults 0 0' >> /etc/fstab

# ============================================
# 2. Docker + git + psql + compose plugin
# ============================================
echo ">>> Instalando Docker, git, psql..."
dnf update -y
dnf install -y docker git postgresql15
systemctl start docker
systemctl enable docker
usermod -aG docker ec2-user

mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
echo ">>> Docker: $(docker --version) | Compose: $(docker compose version)"

# ============================================
# 3. Clonar o repo privado do wpp-ai
# ============================================
echo ">>> Clonando repositorio..."
git clone "https://${github_user}:${github_pat}@github.com/${github_repo}.git" "$APP_DIR"
chown -R ec2-user:ec2-user "$APP_DIR"

# ============================================
# 4. Criar os SCHEMAS no RDS existente (database '${db_name}')
# ============================================
echo ">>> Garantindo schemas wppai/evolution no RDS..."
export PGPASSWORD="${db_password}"
psql -h "${db_address}" -U "${db_username}" -d "${db_name}" -c "CREATE SCHEMA IF NOT EXISTS wppai"
psql -h "${db_address}" -U "${db_username}" -d "${db_name}" -c "CREATE SCHEMA IF NOT EXISTS evolution"
unset PGPASSWORD

# ============================================
# 5. Gerar deploy/.env (lido pelo docker-compose.aws.yml)
# ============================================
DB="${db_username}:${db_password}@${db_address}:5432/${db_name}"
cat > "$APP_DIR/deploy/.env" <<ENV
WPPAI_DOMAIN=${domain_name}
WPPAI_DATABASE_URL=postgresql://$DB?schema=wppai&sslmode=no-verify
EVOLUTION_DATABASE_URI=postgresql://$DB?schema=evolution&sslmode=no-verify
EVOLUTION_API_KEY=${evolution_api_key}
EVOLUTION_WEBHOOK_TOKEN=${evolution_webhook_token}
WPPAI_ADMIN_API_KEY=${wppai_admin_api_key}
ENV
chown ec2-user:ec2-user "$APP_DIR/deploy/.env"
chmod 600 "$APP_DIR/deploy/.env"

# ============================================
# 6. Subir a stack + criar as tabelas do wpp-ai (schema wppai)
# ============================================
echo ">>> Subindo stack (Evolution + wpp-ai + redis)..."
COMPOSE="docker compose -f deploy/docker-compose.aws.yml"
sudo -u ec2-user bash -lc "cd $APP_DIR && $COMPOSE up -d --build"

echo ">>> prisma db push (tabelas do wpp-ai no schema wppai)..."
sudo -u ec2-user bash -lc "cd $APP_DIR && $COMPOSE run --rm wppai npx prisma db push"

chown -R ec2-user:ec2-user "$APP_DIR"
echo "=== Setup finalizado: $(date) ==="
echo ">>> wpp-ai privado em http://<IP-PRIVADO>:8090 (use no WPPAI_URL do Agendota)"
