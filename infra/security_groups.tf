# ============================================
# Security Group da EC2 do wpp-ai (na VPC compartilhada)
# - 22: SSH (seu IP)
# - 8090: SÓ de dentro da VPC (o Agendota chama o wpp-ai privadamente)
# - sem 80/443: wpp-ai não é exposto à internet
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
    description = "wpp-ai API (somente dentro da VPC)"
    from_port   = 8090
    to_port     = 8090
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.shared.cidr_block]
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
