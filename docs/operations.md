# 우나 운영 메모

> 본인 PC 운영(D-034) 기준. 기획 근거: [16 아키텍처와 운영](planning/16-architecture-and-operations.md) §5·§7·§12.
> 비밀값(.env 값, 마스터 키)은 이 문서에 쓰지 않는다. 비밀번호 관리자와 오프라인 사본에만 둔다.

## 1. 평소

| 할 일 | 방법 |
|---|---|
| 새 버전 반영 | `powershell -ExecutionPolicy Bypass -File scripts\update.ps1` — DB 백업 → 이전 이미지 보관 → 빌드 → 마이그레이션 → 교체 → 응답 확인 → 실패하면 이전 버전으로 되돌림 |
| 상태 보기 | 앱 설정 > 운영(주인 계정만): 마지막 백업·휴지통 정리·로그 보관·참은 소비 정산, 꺼짐 감시 연결 여부 |
| 컨테이너 로그 | `docker compose logs app --since 1h` |
| 예약 작업 | 앱 서버 안에서 5분마다(`src/server/jobs.ts`). 꺼져 있던 동안 밀린 일은 켜지면 따라잡음. `job_runs` 표에 기록(90일) |

## 2. 백업 (16 §7)

- **매일 03:00** 작업 스케줄러 `oona-backup`이 `scripts\backup.ps1` 실행. PC가 그 시각에 꺼져 있었으면 켜진 뒤 바로 실행.
  - 운영 DB 덤프 → `BACKUP_DIR\db\daily`(30일) + 달마다 첫 덤프 `db\monthly`(12개월)
  - 데이터 폴더(사진·펫·로그 압축 파일) → `BACKUP_DIR\files`
  - 업데이트 직전 덤프 `pre-update-*.dump`는 최근 10개
- **PC 밖 사본**(아직 연결 전 — 연결하면 `.env`에 적기만 하면 됨):
  - 외장 드라이브: `BACKUP_COPY_TO=E:\oona-backup` (연결 안 된 날은 건너뛰고 설정 > 운영에 표시)
  - 클라우드 드라이브: rclone을 설치하고 `rclone config`로 클라우드 원격 + 그 위에 **crypt(암호화) 원격**을 만든 뒤 `BACKUP_RCLONE_REMOTE=<crypt 원격 이름>:oona`. 동기화 폴더에 두지 않는다(랜섬웨어가 덮어쓸 수 있음). 클라우드 쪽 버전 기록·휴지통을 켠다.
- 작업 다시 등록(새 PC 등):
  ```powershell
  $a = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PWD\scripts\backup.ps1`"" -WorkingDirectory $PWD
  Register-ScheduledTask -TaskName "oona-backup" -Action $a -Trigger (New-ScheduledTaskTrigger -Daily -At 3am) -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)) -Force
  ```

## 3. 복원

- **리허설(분기 1회)**: `powershell -ExecutionPolicy Bypass -File scripts\restore-test.ps1` — 최신 덤프를 빈 DB에 복원해 운영 DB와 행 수 비교 후 지움. 결과는 `job_runs`(restore-test:날짜).
- **같은 PC에서 DB 되돌리기**(장애 때만):
  ```powershell
  docker compose stop app
  docker cp <덤프 파일> oona-db-1:/tmp/r.dump
  docker exec oona-db-1 pg_restore -U oona -d oona --clean --if-exists --no-owner /tmp/r.dump
  docker compose start app
  ```
- 사용자 한 명의 실수(지움·고침)는 백업이 아니라 휴지통·변경 기록으로 되돌린다.

## 4. 새 PC로 옮기기 (RTO 1일)

1. Docker Desktop 설치(WSL2), 로그인 시 자동 시작 켜기. 전원: 절전 안 함. Windows 자동 로그인(재부팅 뒤 Docker가 뜨도록, 16 §5.4).
2. 저장소 받기: `git clone` → 프로젝트 폴더.
3. `.env` 복원(비밀번호 관리자의 사본). **마스터 키(AI_KEY_SECRET)를 잃으면 암호화된 AI 키·건강 기록을 되살릴 수 없다.**
4. `docker compose up -d db` → 백업 덤프를 3번 방법으로 복원.
5. 데이터 폴더(`OONA_FILES_DIR`)에 백업의 `files` 폴더 복사.
6. `powershell -ExecutionPolicy Bypass -File scripts\update.ps1` → 앱·Tailscale 노드 시작. Tailscale은 같은 노드 이름(oona)으로 다시 로그인해 주소 유지(필요하면 `.env` TS_AUTHKEY 새로 발급).
7. 2번 절의 백업 예약 작업 등록, 휴대폰에서 접속·로그인 확인.

## 5. 꺼짐 감시 (16 §5.4)

- 하트비트 감시 서비스(예: Healthchecks.io 무료)에 체크를 하나 만들고(주기 5분, 유예 10분), 핑 주소를 `.env`의 `HEARTBEAT_URL`에 넣은 뒤 `scripts\update.ps1`. 앱이 5분마다 신호를 보내고, 15분 끊기면 그 서비스가 휴대폰으로 알려 준다.
- 재부팅 점검: 재부팅 → (자동 로그인) → Docker 시작 → 휴대폰으로 접속되는지, 설정 > 운영의 시각이 갱신되는지 확인.

## 6. 알림

- 휴대폰: 설정 > 알림 > 이 기기에서 알림 받기. iPhone은 홈 화면에 추가한 앱에서만 된다.
- 보내는 것: 고정 지출 결제 하루 전(9시 뒤), 이번 달 예산 80%·초과(그달 한 번씩), 매달 1일 참은 소비 정산 결과. 종류별로 끌 수 있다.
