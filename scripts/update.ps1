# 우나 운영 반영 (docs/planning/16 §5.6)
# 실행: 프로젝트 폴더에서  powershell -ExecutionPolicy Bypass -File scripts\update.ps1
# 순서: 지금 이미지를 previous로 보관 → 새 이미지 빌드 → 교체 → 상태 확인 → 실패하면 이전 이미지로 되돌리기 → 성공하면 밀려난 옛 이미지 지우기
# 배포 직전 DB 백업은 하지 않음(용량). 필요하면 scripts\backup.ps1을 따로 실행
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$health = "http://127.0.0.1:3331/"

function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }
function Healthy {
  for ($i = 0; $i -lt 30; $i++) {
    try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 $health).StatusCode -eq 200) { return $true } } catch {}
    Start-Sleep -Seconds 2
  }
  return $false
}

Step "지금 이미지를 previous로 보관"
# 지금 previous는 이번에 밀려남 → 성공하면 지움(이미지 하나에 1GB 넘음. latest·previous 두 개만 남김)
$oldPrevious = "$(try { docker image inspect oona-app:previous --format '{{.Id}}' 2>$null } catch {})".Trim() # 없으면 ""
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
if (Healthy) {
  Write-Host "`n반영 완료: 새 버전이 정상 응답합니다." -ForegroundColor Green
  # latest·previous가 아니게 된 옛 이미지만. 아직 이름이 붙어 있거나 쓰는 중이면 docker가 거절함(그대로 둠)
  if ($oldPrevious) { try { docker image rm $oldPrevious *> $null } catch {} }
  exit 0
}

Write-Host "새 버전이 응답하지 않아 이전 버전으로 되돌립니다." -ForegroundColor Yellow
if ($hadPrevious) {
  docker tag oona-app:previous oona-app:latest
  docker compose up -d --no-build app
  if (Healthy) { Write-Host "이전 버전으로 되돌렸습니다." -ForegroundColor Yellow } else { Write-Host "되돌린 버전도 응답하지 않습니다. docker compose logs app 을 확인하세요." -ForegroundColor Red }
}
exit 1
