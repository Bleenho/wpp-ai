# ============================================
# wpp-ai — Infra AWS (stack separada)
# Reaproveita a VPC/subnet e o RDS já criados pela fereoli (igual ao agendota).
# wpp-ai fica PRIVADO: só o Agendota (mesma VPC) o alcança em :8090.
# ============================================
terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}
