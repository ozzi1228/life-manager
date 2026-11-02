# 우나 매일 백업 (docs/planning/16 §7). 작업 스케줄러가 매일 03:00에 실행(PC가 꺼져 있었으면 켜진 뒤 바로)
# 수동 실행: powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
# 1) 운영 DB 덤프(pg_dump -Fc) → BACKUP_DIR\db\daily (30일) + 달마다 첫 덤프를 db\monthly (12개월)
# 2) 데이터 폴더(사진·펫·로그 압축 파일) → BACKUP_DIR\files (그대로 맞춤)
# 3) PC 밖 사본: .env의 BACKUP_COPY_TO(외장 드라이브 등, 세미콜론으로 여러 곳) · BACKUP_RCLONE_REMOTE(rclone 암호화 원격, 예: oona-crypt:oona)
# 4) 결과를 운영 DB job_runs(key backup:날짜)에 남김 → 설정 > 운영에 표시
# ponytail: 파일은 "지금 상태 그대로 맞춤"만(지운 사진의 옛 사본은 남지 않음) — 필요해지면 달마다 압축 사본
$ErrorActionPreference = "Stop"
# SQL을 stdin으로 보냄(명령 인자로 넘기면 Windows가 큰따옴표를 지움). 한글이 깨지지 않게 UTF-8
$OutputEncoding = [Text.UTF8Encoding]::new($false)
Set-Location (Split-Path $PSScriptRoot -Parent)

function EnvValue($name, $default = "") {
  $line = Get-Content .env | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
  if ($line) { return ($line -split "=", 2)[1].Trim() } else { return $default }
}

$backupDir = EnvValue "BACKUP_DIR" "C:\oona-data\backups"
$filesDir = EnvValue "OONA_FILES_DIR"
$copyTo = (EnvValue "BACKUP_COPY_TO") -split ";" | Where-Object { $_ }
$remote = EnvValue "BACKUP_RCLONE_REMOTE"
$today = Get-Date -Format "yyyy-MM-dd"
$stamp = Get-Date -Format "yyyyMMdd"
$notes = @()

function Record($status, $detail, $err) {
  $json = ($detail | ConvertTo-Json -Compress).Replace("'", "''")
  $e = if ($err) { "'" + $err.Replace("'", "''").Substring(0, [Math]::Min(500, $err.Length)) + "'" } else { "null" }
  $sql = "insert into job_runs (id, key, job, status, detail, error, started_at, finished_at) values (gen_random_uuid(), 'backup:$today', 'backup', '$status', '$json'::jsonb, $e, now(), now()) on conflict (key) do update set status = excluded.status, detail = excluded.detail, error = excluded.error, finished_at = now()"
  $sql | docker exec -i oona-db-1 psql -U oona -d oona -q -v ON_ERROR_STOP=1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Host "  결과 기록 실패(job_runs)" -ForegroundColor Yellow }
}

try {
  # 1) DB
  $daily = Join-Path $backupDir "db\daily"
  $monthly = Join-Path $backupDir "db\monthly"
  New-Item -ItemType Directory -Force $daily, $monthly | Out-Null
  $dump = Join-Path $daily "oona-$stamp.dump"
  docker exec oona-db-1 sh -c "pg_dump -U oona -Fc oona > /tmp/daily.dump"
  if ($LASTEXITCODE -ne 0) { throw "pg_dump 실패" }
  docker cp oona-db-1:/tmp/daily.dump $dump | Out-Null
  $size = (Get-Item $dump).Length
  if ($size -lt 1024) { throw "덤프가 너무 작아요($size 바이트)" }
  $month = Join-Path $monthly ("oona-" + (Get-Date -Format "yyyyMM") + ".dump")
  if (-not (Test-Path $month)) { Copy-Item $dump $month }
  Get-ChildItem $daily -Filter *.dump | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item
  Get-ChildItem $monthly -Filter *.dump | Sort-Object Name -Descending | Select-Object -Skip 12 | Remove-Item
  Get-ChildItem $backupDir -Filter "pre-update-*.dump" | Sort-Object Name -Descending | Select-Object -Skip 10 | Remove-Item

  # 2) 파일(로보카피 종료 코드 8 이상이 실패)
  if ($filesDir -and (Test-Path $filesDir)) {
    robocopy $filesDir (Join-Path $backupDir "files") /MIR /R:2 /W:5 /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "파일 복사 실패(robocopy $LASTEXITCODE)" }
  }

  # 3) PC 밖 사본
  foreach ($dest in $copyTo) {
    if (Test-Path (Split-Path $dest -Qualifier)) {
      robocopy $backupDir $dest /MIR /R:2 /W:5 /NFL /NDL /NJH /NJS /NP | Out-Null
      if ($LASTEXITCODE -ge 8) { $notes += "사본 실패: $dest" } else { $notes += "사본: $dest" }
    } else { $notes += "연결 안 됨: $dest" }
  }
  if ($remote) {
    if (Get-Command rclone -ErrorAction SilentlyContinue) {
      rclone sync $backupDir $remote --quiet
      if ($LASTEXITCODE -ne 0) { $notes += "원격 실패: $remote" } else { $notes += "원격: $remote" }
    } else { $notes += "rclone 없음" }
  }
  if (-not $copyTo -and -not $remote) { $notes += "PC 밖 사본 없음(BACKUP_COPY_TO·BACKUP_RCLONE_REMOTE)" }

  $failedCopy = $notes | Where-Object { $_ -match "실패|연결 안 됨|rclone 없음" }
  Record "ok" @{ dumpBytes = $size; notes = $notes } ($(if ($failedCopy) { $failedCopy -join "; " } else { $null }))
  Write-Host "백업 완료: $dump ($([Math]::Round($size / 1KB)) KB)" -ForegroundColor Green
  $notes | ForEach-Object { Write-Host "  $_" }
} catch {
  Write-Host "백업 실패: $_" -ForegroundColor Red
  try { Record "failed" @{ notes = $notes } "$_" } catch {}
  exit 1
}
