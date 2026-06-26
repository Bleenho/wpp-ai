# ============================================
# Key Pair (gera a chave SSH automaticamente)
# ============================================
resource "tls_private_key" "app" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "app" {
  key_name   = var.ec2_key_name
  public_key = tls_private_key.app.public_key_openssh
}

resource "local_file" "private_key" {
  content         = tls_private_key.app.private_key_pem
  filename        = "${path.module}/${var.ec2_key_name}.pem"
  file_permission = "0400"
}

# ============================================
# EC2 do wpp-ai (subnet pública compartilhada; IP público só p/ egress/SSH,
# o Agendota o alcança pelo IP PRIVADO)
# ============================================
resource "aws_instance" "app" {
  ami                         = data.aws_ami.al2023.id
  instance_type               = var.ec2_instance_type
  key_name                    = aws_key_pair.app.key_name
  subnet_id                   = data.aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.ec2.id]
  associate_public_ip_address = true

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
    encrypted   = true
  }

  user_data = base64gzip(templatefile("${path.module}/user_data.sh", {
    db_address              = data.aws_db_instance.shared.address
    db_username             = var.db_username
    db_password             = var.db_password
    db_name                 = var.db_name
    domain_name             = var.domain_name
    evolution_api_key       = var.evolution_api_key
    evolution_webhook_token = var.evolution_webhook_token
    wppai_admin_api_key     = var.wppai_admin_api_key
    github_repo             = var.github_repo
    github_user             = var.github_user
    github_pat              = var.github_pat
  }))

  tags = {
    Name        = "${var.project_name}-app"
    Environment = var.environment
  }

  lifecycle {
    ignore_changes = [ami, user_data]
  }
}

# ============================================
# Elastic IP (IP fixo p/ apontar o DNS de wpp.agendota.com)
# ============================================
resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"

  tags = { Name = "${var.project_name}-eip" }
}
