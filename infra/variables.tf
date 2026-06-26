# ============================================
# Variáveis
# ============================================
variable "aws_region" {
  description = "Região AWS (a MESMA do agendota/fereoli)"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefixo dos recursos"
  type        = string
  default     = "wppai"
}

variable "environment" {
  description = "Ambiente"
  type        = string
  default     = "prod"
}

# ---------- EC2 ----------
variable "ec2_instance_type" {
  description = "Tipo da EC2 (x86 p/ casar com a AMI amd64). t3.small = 2GB."
  type        = string
  default     = "t3.small"
}

variable "ec2_key_name" {
  description = "Nome do Key Pair SSH do wpp-ai"
  type        = string
  default     = "wppai-key"
}

variable "my_ip" {
  description = "Seu IP para SSH (ex: 1.2.3.4/32). 0.0.0.0/0 libera p/ qualquer um."
  type        = string
  default     = "0.0.0.0/0"
}

variable "domain_name" {
  description = "Domínio público do wpp-ai (TLS via Caddy). Aponte o DNS para o EIP de saída."
  type        = string
  default     = "wpp.agendota.com"
}

# ---------- Rede/RDS compartilhados (criados pela fereoli) ----------
variable "shared_vpc_name" {
  description = "Tag Name da VPC existente"
  type        = string
  default     = "fereoli-vpc"
}

variable "shared_subnet_name" {
  description = "Tag Name da subnet pública existente"
  type        = string
  default     = "fereoli-public-subnet"
}

variable "shared_rds_identifier" {
  description = "Identificador do RDS existente"
  type        = string
  default     = "fereoli-db"
}

# ---------- Banco (RDS existente, SCHEMAS novos) ----------
variable "db_username" {
  description = "Usuário master do RDS (o mesmo da fereoli/agendota)"
  type        = string
  default     = "postgres"
}

variable "db_password" {
  description = "Senha master do RDS"
  type        = string
  sensitive   = true
}

variable "db_name" {
  description = "Database EXISTENTE onde criar os schemas wppai/evolution (ex.: agendota)"
  type        = string
  default     = "agendota"
}

# ---------- wpp-ai / Evolution ----------
variable "evolution_api_key" {
  description = "Chave global da Evolution (gere com: openssl rand -hex 32)"
  type        = string
  sensitive   = true
}

variable "evolution_webhook_token" {
  description = "Segredo opcional p/ validar webhooks da Evolution"
  type        = string
  default     = ""
  sensitive   = true
}

variable "wppai_admin_api_key" {
  description = "Chave de admin do wpp-ai (POST /admin/systems). Gere com: openssl rand -hex 32"
  type        = string
  sensitive   = true
}

# ---------- GitHub (clone do repo privado na EC2) ----------
variable "github_repo" {
  description = "owner/repo do wpp-ai no GitHub"
  type        = string
  default     = "Bleenho/wpp-ai"
}

variable "github_user" {
  description = "Usuário GitHub (para clonar o repo privado)"
  type        = string
  default     = "Bleenho"
}

variable "github_pat" {
  description = "Personal Access Token com leitura de Contents do repo wpp-ai"
  type        = string
  sensitive   = true
}
