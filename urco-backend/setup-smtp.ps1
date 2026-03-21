# ============================================================
# setup-smtp.ps1 - Configure les variables SMTP sur le VPS
# Usage : .\setup-smtp.ps1 -SmtpUser "email@gmail.com" -SmtpPass "xxxx xxxx xxxx xxxx"
# ============================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$SmtpUser,

    [Parameter(Mandatory=$true)]
    [string]$SmtpPass,

    [string]$SmtpHost = "smtp.gmail.com",
    [string]$SmtpPort = "587",
    [string]$SmtpFrom = "",
    [string]$ServerIP = "82.165.35.28",
    [string]$ServerUser = "root",
    [string]$AppDir = "/var/www/urco-backend"
)

$SmtpFromValue = if ([string]::IsNullOrWhiteSpace($SmtpFrom)) { "URCO <$SmtpUser>" } else { $SmtpFrom }

$tmpScript = "$env:TEMP\setup-smtp.sh"
$lines = @(
    "#!/bin/bash",
    "set -e",
    "cd $AppDir",
    "for KEY in SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM; do",
    '  sed -i "/^${KEY}=/d" .env 2>/dev/null || true',
    "done",
    "printf 'SMTP_HOST=$SmtpHost\nSMTP_PORT=$SmtpPort\nSMTP_USER=$SmtpUser\nSMTP_PASS=$SmtpPass\nSMTP_FROM=$SmtpFromValue\n' >> .env",
    "echo 'SMTP configure avec succes.'",
    "grep '^SMTP_HOST\|^SMTP_PORT\|^SMTP_FROM' .env",
    "pm2 restart urco-backend",
    "echo 'Serveur redemarre.'"
)
[System.IO.File]::WriteAllText($tmpScript, ($lines -join "`n") + "`n", [System.Text.Encoding]::ASCII)

Write-Host ""
Write-Host "Configuration SMTP sur $ServerUser@$ServerIP..." -ForegroundColor Cyan
Write-Host ""

scp $tmpScript "${ServerUser}@${ServerIP}:/tmp/setup-smtp.sh"
ssh "${ServerUser}@${ServerIP}" "bash /tmp/setup-smtp.sh && rm /tmp/setup-smtp.sh"

Write-Host ""
Write-Host "Termine. Testez l'envoi d'email avec ./test-sendcode.ps1" -ForegroundColor Green