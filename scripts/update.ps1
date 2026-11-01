# 우나 운영 반영 (docs/planning/16 §5.6)
# 실행: 프로젝트 폴더에서  powershell -ExecutionPolicy Bypass -File scripts\update.ps1
# 순서: DB 백업 → 지금 이미지를 previous로 보관 → 새 이미지 빌드 → 교체 → 상태 확인 → 실패하면 이전 이미지로 되돌리기
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$backupDir = "C:\oona-data\backups"
$health = "http://127.0.0.1:3331/"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }
function Healthy {
  for ($i = 0; $i -lt 30; $i++) {
    try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 $health).StatusCode -eq 200) { return $true } } catch {}
    Start-Sleep -Seconds 2
  }
  return $false
}

Step "DB 백업(업데이트 직전)"
New-Item -ItemType Directory -Force $backupDir | Out-Null
docker exec oona-db-1 sh -c "pg_dump -U oona -Fc oona > /tmp/pre-update.dump"
docker cp oona-db-1:/tmp/pre-update.dump "$backupDir\pre-update-$stamp.dump"
Write-Host "  $backupDir\pre-update-$stamp.dump"

Step "지금 이미지를 previous로 보관"
$hadPrevious = $false
docker image inspect oona-app:latest *> $null
if ($LASTEXITCODE -eq 0) { docker tag oona-app:latest oona-app:previous; $hadPrevious = $true }

Step "새 이미지 빌드"
docker compose build app
if ($LASTEXITCODE -ne 0) { Write-Host "빌드 실패: 지금 실행 중인 버전을 그대로 둡니다." -ForegroundColor Red; exit 1 }

# DB 마이그레이션(열 추가 → 코드 배포 → 옛 열 제거 순서, 16 §11). 개발 DB가 아닌 운영 DB(oona)에 적용
Step "운영 DB 마이그레이션(인증 테이블)"
$pw = ((Get-Content .env | Where-Object { $_ -match '^POSTGRES_PASSWORD=' }) -split '=', 2)[1]
$env:DATABASE_URL = "postgres://oona:$pw@127.0.0.1:55440/oona" # .env보다 이 값이 우선
node --env-file=.env scripts/migrate.mts
$migrateExit = $LASTEXITCODE
Remove-Item Env:DATABASE_URL
if ($migrateExit -ne 0) { Write-Host "마이그레이션 실패: 지금 실행 중인 버전을 그대로 둡니다." -ForegroundColor Red; exit 1 }

Step "교체"
docker compose up -d --no-build app
if (Healthy) { Write-Host "`n반영 완료: 새 버전이 정상 응답합니다." -ForegroundColor Green; exit 0 }

Write-Host "새 버전이 응답하지 않아 이전 버전으로 되돌립니다." -ForegroundColor Yellow
if ($hadPrevious) {
  docker tag oona-app:previous oona-app:latest
  docker compose up -d --no-build app
  if (Healthy) { Write-Host "이전 버전으로 되돌렸습니다." -ForegroundColor Yellow } else { Write-Host "되돌린 버전도 응답하지 않습니다. docker compose logs app 을 확인하세요." -ForegroundColor Red }
}
exit 1
