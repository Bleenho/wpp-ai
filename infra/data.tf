# ============================================
# Data sources — recursos JÁ existentes (fereoli). Apenas LEITURA.
# ============================================
data "aws_vpc" "shared" {
  tags = { Name = var.shared_vpc_name }
}

data "aws_subnet" "public" {
  tags = { Name = var.shared_subnet_name }
}

data "aws_db_instance" "shared" {
  db_instance_identifier = var.shared_rds_identifier
}

# AMI Amazon Linux 2023 x86_64 (casa com t3.small)
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}
