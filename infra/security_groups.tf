# ============================================
# Security Group da EC2 do wpp-ai (na VPC compartilhada)
# - 22: SSH (seu IP)
# - 8090: SÓ de dentro da VPC (o Agendota chama o wpp-ai privadamente)
# - 80/443: público, via Caddy (TLS) p/ wpp.agendota.com (painel/API + admin)
# ============================================
resource "aws_security_group" "ec2" {
  name        = "${var.project_name}-ec2-sg"
  description = "SG da EC2 do wpp-ai (Evolution + wpp-ai + redis)"
  vpc_id      = data.aws_vpc.shared.id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.my_ip]
  }

  ingress {
    description = "wpp-ai API (somente dentro da VPC — Agendota usa o IP privado)"
    from_port   = 8090
    to_port     = 8090
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.shared.cidr_block]
  }

  ingress {
    description = "HTTP (Caddy/Let's Encrypt)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS (painel/API públicos via Caddy)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-ec2-sg" }
}

# NOTA: o acesso ao RDS (5432) é liberado no SG do RDS (stack fereoli) para o
# CIDR da subnet pública — como esta EC2 fica na MESMA subnet do agendota, ela
# já alcança o RDS sem mudança adicional.
