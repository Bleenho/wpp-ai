output "wppai_private_ip" {
  description = "IP PRIVADO do wpp-ai. Use no Agendota: WPPAI_URL=http://<este-ip>:8090"
  value       = aws_instance.app.private_ip
}

output "wppai_public_ip" {
  description = "IP público (apenas para SSH / egress)"
  value       = aws_instance.app.public_ip
}

output "ssh_command" {
  description = "Comando p/ acessar a EC2"
  value       = "ssh -i ${var.ec2_key_name}.pem ec2-user@${aws_instance.app.public_ip}"
}

output "wppai_url_for_agendota" {
  description = "Valor de WPPAI_URL a setar no .env do Agendota"
  value       = "http://${aws_instance.app.private_ip}:8090"
}
