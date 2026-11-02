# 복원 리허설 (docs/planning/16 §7: 분기 1회) — 최신 백업 덤프를 빈 DB(oona_restore_test)에 복원해 운영 DB와 행 수를 비교하고 지움
# 실행: powershell -ExecutionPolicy Bypass -File scripts\restore-test.ps1
# 운영 DB는 읽기만 함. 결과는 job_runs(key restore-test:날짜)에 남김
# ponytail: 행 수 비교까지(체크섬·화면 확인·purge ledger 재적용은 탈퇴·완전 삭제(C-14)가 생기면)
$ErrorActionPreference = "Stop"
# SQL을 stdin으로 보냄(명령 인자로 넘기면 Windows가 큰따옴표를 지움). 한글이 깨지지 않게 UTF-8
$OutputEncoding = [Text.UTF8Encoding]::new($false)
Set-Location (Split-Path $PSScriptRoot -Parent)

$backupDir = ((Get-Content .env | Where-Object { $_ -match "^BACKUP_DIR=" } | Select-Object -First 1) -split "=", 2)[1]
if (-not $backupDir) { $backupDir = "C:\oona-data\backups" }
$dump = Get-ChildItem (Join-Path $backupDir "db\daily") -Filter *.dump | Sort-Object Name -Descending | Select-Object -First 1
if (-not $dump) { Write-Host "덤프가 없어요. 먼저 scripts\backup.ps1을 실행하세요" -ForegroundColor Red; exit 1 }
Write-Host "복원할 덤프: $($dump.FullName)"

function Psql($db, $sql) { $sql | docker exec -i oona-db-1 psql -U oona -d $db -tA -v ON_ERROR_STOP=1 }
$tables = "transactions", "recurring_payments", "budgets", "cards", "card_benefits", "goals", "tracker_items", "tracker_cells", "journal_entries", "attachments", "media_works", "media_logs", "wish_items", "restraint_entries", "events", "calendars", "health_records", "revisions", "user"

docker cp $dump.FullName oona-db-1:/tmp/restore-test.dump | Out-Null
Psql "oona" "drop database if exists oona_restore_test" | Out-Null
Psql "oona" "create database oona_restore_test" | Out-Null
try {
  docker exec oona-db-1 pg_restore -U oona -d oona_restore_test --no-owner /tmp/restore-test.dump
  if ($LASTEXITCODE -ne 0) { throw "pg_restore 실패" }
  $rows = foreach ($t in $tables) {
    $q = "select count(*) from `"$t`""
    [pscustomobject]@{ table = $t; backup = [int](Psql "oona_restore_test" $q); live = [int](Psql "oona" $q) }
  }
  $rows | Format-Table -AutoSize
  # 덤프 뒤에 새로 쓴 것이 있을 수 있어 백업 <= 지금이면 정상, 백업이 더 많거나 0인데 지금은 있으면 이상
  $bad = $rows | Where-Object { $_.backup -gt $_.live -or ($_.backup -eq 0 -and $_.live -gt 0 -and $_.table -ne "revisions") }
  $status = if ($bad) { "failed" } else { "ok" }
  $detail = (@{ dump = $dump.Name; tables = $rows.Count; mismatched = @($bad | ForEach-Object { $_.table }) } | ConvertTo-Json -Compress).Replace("'", "''")
  Psql "oona" "insert into job_runs (id, key, job, status, detail, started_at, finished_at) values (gen_random_uuid(), 'restore-test:$(Get-Date -Format yyyy-MM-dd)', 'restore.test', '$status', '$detail'::jsonb, now(), now()) on conflict (key) do update set status = excluded.status, detail = excluded.detail, finished_at = now()" | Out-Null
  if ($bad) { Write-Host "확인 필요: $($bad.table -join ', ')" -ForegroundColor Yellow; exit 1 }
  Write-Host "복원 리허설 통과: $($rows.Count)개 테이블을 되살렸어요" -ForegroundColor Green
} finally {
  Psql "oona" "drop database if exists oona_restore_test" | Out-Null
  docker exec oona-db-1 rm -f /tmp/restore-test.dump
}
