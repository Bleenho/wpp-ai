output "wppai_eip" {
  description = "IP fixo (EIP) do wpp-ai. Aponte o DNS do dominio para este IP."
  value       = aws_eip.app.public_ip
}

output "dns_config" {
  description = "Registro DNS a criar"
  value       = "A   ${var.domain_name}   ->   ${aws_eip.app.public_ip}"
}

output "wppai_private_ip" {
  description = "IP PRIVADO. O Agendota (mesma VPC) pode usar isto em WPPAI_URL=http://<ip>:8090"
  value       = aws_instance.app.private_ip
}

output "ssh_command" {
  description = "Comando p/ acessar a EC2"
  value       = "ssh -i ${var.ec2_key_name}.pem ec2-user@${aws_eip.app.public_ip}"
}

output "wppai_url_public" {
  description = "URL pública do wpp-ai (após o DNS propagar e o TLS emitir)"
  value       = "https://${var.domain_name}"
}
