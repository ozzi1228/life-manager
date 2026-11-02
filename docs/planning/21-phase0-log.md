# 21. 0단계 진행 기록

> 시작 2026-11-01 · 검증 항목 정의는 [17 §2](17-development-roadmap.md#2-0단계-검증준비)

## 1. 현황

| ID | 검증 | 상태 | 결과·남은 일 | 누가 |
|---|---|---|---|---|
| V-01 | 본인 PC 운영 환경 | **완료(재부팅 시험 제외)** — 2026-11-01 앱을 컨테이너로 상시 실행(`Dockerfile` standalone, compose `app`, 127.0.0.1:3331), Tailscale 노드가 app 컨테이너를 직접 가리킴(`http://app:3000`), 업데이트 스크립트 `scripts/update.ps1`(DB 백업 → 이전 이미지 보관 → 빌드 → 교체 → 상태 확인 → 실패 시 되돌리기) 실제 실행 성공. 휴대폰 HTTPS 접속·홈 화면 설치 확인 완료. 이하 원래 기록: | Next.js 16.4 + shadcn + Postgres 17(Docker) 동작 확인. 우나 전용 Tailscale 노드 `oona` 연결 완료(2026-11-01): `https://oona.<tailnet>.ts.net` → 200, 인증서 자동 발급, **Funnel 꺼짐(사설망 전용)** 확인, 기존 기기 `<기존 기기>` 설정 변화 없음 확인. 남은 일: 휴대폰에서 접속·PWA 설치(사용자), 운영 서버 상시 실행(지금은 개발 세션에서 띄운 임시 프로세스 → app 컨테이너로, M-21), 업데이트 스크립트 | 사용자(휴대폰 확인) + 개발 |
| V-02 | 테마·글꼴 | **완료** | 테마 적용, Pretendard 두 모드 동일 확인. 명암비 실측 → T-2·T-3 확인, T-9 새로 발견 ([03 §2.3](03-design-system.md#23-명암비-실측-결과-0단계-v-02-2026-11-01)). 보완 토큰 구현은 M-02 | 개발 |
| V-03 | 카카오·네이버 로그인 | **완료** (2026-11-01) | 사용자가 카카오 디벨로퍼스·네이버 개발자센터에 앱 등록(카카오: 동의항목 닉네임 필수·프로필 사진 선택, 네이버: 별명·프로필 사진, 개발 중 상태·검수 안 함). 콘솔이 ts.net 주소와 localhost(개발)를 콜백 주소로 받아 줌. 휴대폰에서 두 곳 모두 인증 → 콜백 → 토큰 교환 → 프로필 받기 성공, 처음 온 계정은 의도대로 자동 가입이 막힘(`signup_disabled`, 13 §2.3). 결과는 `/dev/auth`에 표시. **주의**: 앱을 설치한 안드로이드에서 **크롬으로** 로그인하면 돌아오는 주소가 크롬과 설치한 앱에서 동시에 열려 콜백이 두 번 들어오고, 두 번째는 state 불일치로 실패해 앱 홈으로 넘어감. 설치한 앱 안에서 시작하면 한 번만 들어옴 → 실제 로그인 화면(M 단계)에서 state 오류로 돌아오면 세션을 확인해 이미 로그인됐으면 그대로 진행하도록 처리(13 §4.4) | 사용자 → 개발 |
| V-04 | PWA 푸시 | **완료** (2026-11-01, 사용자 휴대폰에서 알림 수신 확인. 앱을 닫은 상태의 수신은 다음 실사용 때 함께 확인) | 매니페스트(우나, standalone)·임시 아이콘 180/192/512·서비스 워커(`/sw.js`, 캐시 금지 헤더)·VAPID 키·시험 페이지 `/dev/push` 구현, 우나 주소에서 모두 200 확인. 휴대폰에서 접속 확인(사용자). 개발 PC의 내장 브라우저는 알림 권한·서비스 워커가 막혀 있어 푸시는 휴대폰에서만 확인 가능. 구독은 서버 메모리에만 저장(서버 재시작 시 다시 켜야 함) | 사용자(휴대폰) |
| V-05 | 펫 렌더러 | **완료** (2026-11-01) | 사용자 캐릭터 시트(D-053)에서 5종 × 9동작을 잘라 투명 PNG로(처음엔 시트에서 잘라 씀, V-07에서 고해상도 그림으로 교체 → `public/pets/<id>/<동작>.png`). 동작당 그림 한 장 + 앱 효과(숨쉬기·통통·깡충·흔들기). 확인: 끌어 옮기기(클릭과 구분), 놓은 뒤 스스로 다시 이동(고정 안 됨), 모달 위에 놓이면 비켜 감, 누르면 놀람, 10초 무입력 시 잠자기, 펫 바꾸기, 펫 끄기(D-054) 시 사라짐. 성능: 프레임당 계산 평균 0.02~0.04ms·최대 0.2ms(기준 2ms). 초당 프레임 32는 내장 브라우저 자체 한계(빈 루프 27)로 펫과 무관. 따라오기는 D-055로 제거. 걷기 개선(사용자 피드백): 같은 높이에서 좌우로만 걷기(3초 측정 높이 변화 0), 발 따로 들기, 걸음에 맞춘 전진·디딤 눌림 → 11 §3.1. 이어서 뒷걸음질 제거(가는 방향 보기, 오른쪽 걷기 67회 모두 뒤집힘 확인), 터치로 잡을 때 그림 전환 최소화(놀라기→대기), 멍이 앉기 그림 제외. **사용자 휴대폰에서 겹침 해소 확인(2026-11-01).** 이어서 사용자 요청으로 모든 펫이 정면 그림으로 **두 발 아장아장** 걷기(디딘 발을 축으로 ±6° 뒤뚱, 뒷걸음질 없음), 펫별 그림 바꿔 끼우기 표(포몽 애교→기뻐하기, 멍이 앉기·무언가 발견→대기 등), 펫 설정 저장(새로고침 후 유지 확인). 휴대폰 실기기 확인은 사용자 | 개발 + 사용자(휴대폰) |
| V-06 | 펫 업로드 변환 | **완료** (2026-11-01) | `src/lib/pet-convert.ts`: PNG·WebP(한 장)·GIF·움직이는 WebP → 256px 프레임을 가로로 늘어놓은 WebP 띠. 모든 프레임을 한 상자로 잘라 같은 배율로 줄임(동작 안에서 발 위치 유지), 발은 기본 펫과 같은 줄. 확인(`scripts/check-pet-convert.mts`, 시험 화면 `/dev/pet-upload`): GIF·WebP 4프레임 → 8fps·반복 인식, 밝은·어두운 바탕에서 가장자리 깨짐 없음, 용량 4프레임 46~50KB(WebP 품질 90·투명도 무손실, 무손실 135KB 대비 약 1/3 → 동작 15종 2MB 목표 충족 예상), 흰 배경은 경고, 2MB 초과·빈 그림·JPEG·그림 아닌 파일은 거부. **한계**: APNG는 첫 장만 읽힘(sharp/libvips 미지원) → 형식 목록에서 빼기를 제안(Q-112), 흰 바탕으로 저장된 GIF의 흰 테두리는 지우지 못함(가이드 문구로 안내) | 개발 |
| V-07 | 기본 펫 제작 | **완료** (2026-11-01) | 사용자가 캐릭터 시트를 참고해 ChatGPT로 5종 × 8동작을 1024px 투명 PNG로 생성(`assets/pets-hd/<id>/<동작>.png`). `scripts/fit-pets.mjs`로 256px에 맞춤(서 있는 동작은 키를 같게, 발은 같은 줄). 걷기도 정면 두 발 그림이 생겨 그림 바꿔 끼우기 표(`ART`)와 "따라오기" 그림 삭제 | 사용자 → 개발 |
| V-08 | 구글 캘린더 | 대기 | Google Cloud 콘솔 프로젝트·OAuth 동의 화면(Production, 미검증) | **사용자**(콘솔) → 개발 |
| V-09 | AI 연결 | **틀 완성** (2026-11-01, D-060) | 연결 저장(사용자별 순서, API 키 암호화)·자동 전환 체인·시험 화면 `/dev/ai` 완성. 운영 컨테이너에서 Claude Code 2.1.282·Codex 0.157.0 실행 확인, 로그인 폴더 연결·쓰기 확인, 로그인 전에는 "로그인 필요"로 다음 연결로 넘어가는 것 확인. 사용자 구독 로그인 후 **실제 답 확인**: 개발 서버 `/dev/ai`에서 Claude 구독이 답함(약 10초), ChatGPT 구독 약 6초, 운영 컨테이너 안에서도 두 구독 모두 답함. 해결한 문제 두 가지: ① Claude Code가 스스로 업데이트하며 node_modules의 실행 파일 이름을 바꿈 → `DISABLE_AUTOUPDATER=1` ② 컨테이너에서 Codex가 윈도 공유 폴더 위에 작업 파일을 만들지 못함 → 실행 폴더는 컨테이너 안에 두고 로그인 정보(auth.json)만 옮겨 씀(갱신되면 다시 저장). API 키는 나중에 넣으면 됨. 도구 호출·선택지(카드 상담)는 C-05 | 사용자(로그인) → 개발 |
| V-10 | ChatGPT 계정 플랜 사용 | **대체**(D-060) | "Sign in with ChatGPT" 대신 agent-company와 같은 Codex CLI 로그인으로 ChatGPT 구독을 씀(V-09에 포함) | — |
| V-11 | 인증 라이브러리 | **완료** (2026-11-01) | Better Auth 1.7.15로 결정(Q-132). 확인: ① 이메일 없이 아이디·비밀번호 가입·로그인(이메일 칸은 내부 주소 `id.<아이디>@users.oona.invalid`로 채우고 화면엔 "없음") ② 아이디 규칙 검사·중복 확인·같은 아이디 재가입 차단 ③ 틀린 비밀번호에 구분 없는 문구 ④ 비밀번호 Argon2id(`m=19456,t=2,p=1`), 운영 컨테이너(alpine)에서도 동작 ⑤ 세션 DB 저장·30일·HttpOnly 쿠키 ⑥ 카카오·네이버 기본 지원, 이메일 요청 끄고 내부 주소로 대체 가능(코드 확인) ⑦ 이메일이 같아도 자동 병합 안 함·명시적 연결(link-social)·마지막 로그인 수단 해제 차단(기본 내장) ⑧ 간편 로그인 자동 가입 막고 "처음 오셨나요?" 선택 가능(disableImplicitSignUp + requestSignUp). 실제 카카오·네이버 로그인은 V-03(개발자 앱 등록) 후. 주의: 라이브러리 오류 문구가 영어라 화면용 한국어 문구표 필요 | 개발 |
| V-12 | 상시 가동 | **설정 확인 완료, 재부팅 시험 대기** | 이 PC의 기존 설정으로 충족: AC 전원 절전 안 함, Windows 자동 로그인 켜짐, Docker Desktop 로그인 시 자동 시작, 컨테이너 3개 모두 `unless-stopped`. 남은 일: 실제 재부팅 후 휴대폰 접속 확인(사용자, 2026-11-01 "나중에" — 다음 재부팅 때 확인), 하트비트 감시 서비스 가입·연결(사용자 계정 필요) | 사용자 |
| V-13 | 백업·복원 | **PC 안 백업·복원 리허설 완료(2026-11-02)**, PC 밖 사본 대기 | `scripts/backup.ps1` 첫 실행(덤프 144KB) · `scripts/restore-test.ps1` 통과(19개 테이블 행 수 일치). 남은 일: 매일 03:00 예약 작업 등록(사용자가 명령 실행, docs/operations.md §2), 외장 드라이브 연결·클라우드 드라이브 종류 정하기(rclone crypt) | **사용자** → 개발 |

## 2. 지금까지 만든 것 (프로젝트 루트)

| 파일 | 내용 |
|---|---|
| `package.json` | Next.js 16.4.3, React 19.3, Tailwind 4, shadcn(radix-nova), Pretendard 1.3.9. 개발 `npm run dev`(3330), 운영 `npm start`(3331), 둘 다 127.0.0.1 |
| `src/app/globals.css` | tweakcn Salesforce 테마 + 글꼴 변수 Pretendard로 덮어씀(D-044) |
| `src/app/layout.tsx` | `lang="ko"`, 제목 "우나", Pretendard 불러오기 |
| `src/app/dev/theme/page.tsx` | 테마 점검 페이지(명암비 실측) — 개발용, 출시 전 제거 또는 개발 환경 전용으로 |
| `docker-compose.yml` | Postgres 17, 127.0.0.1:55440, 볼륨 `oona_oona-pg` |
| `.env` / `.env.example` | DB 비밀번호(무작위 생성, `.env`는 저장소 제외) |
| `.claude/launch.json` | 미리보기용 개발 서버 설정 |
| `docker-compose.yml` `tailscale` 서비스 + `tailscale/serve.json` | 우나 전용 Tailscale 노드(`oona`), 443 → 이 PC 3331, Funnel 꺼짐 |
| `src/app/manifest.ts`, `src/app/icon.png`·`apple-icon.png`, `public/icons/`, `scripts/make-icons.mjs`, `public/sw.js` | 홈 화면 설치 정보, 로고(`assets/logo.png`)에서 만든 앱 아이콘, 탭·알림용 작은 다이어리 아이콘(`assets/logo-small.svg`)(로고 바꾸면 스크립트 다시 실행), 푸시 수신 서비스 워커 |
| `src/app/dev/push/` | 푸시 시험 페이지·서버 액션(개발용) |
| `docs/planning/assets/pets-reference.png` | 사용자 제공 기본 펫 캐릭터 시트(D-053, 원본) |
| `scripts/fit-pets.mjs` | 고해상도 펫 그림(`assets/pets-hd`)을 앱용 256px로 맞춤. 시트에서 잘라 쓰던 `cut-pets.mjs`는 V-07로 대체되어 삭제 |
| `public/pets/<id>/<동작>.png` | 포몽·코몽·삐요·멍이·호야 × 대기·걷기·앉기·놀라기·기뻐하기·잠자기·호버·따라오기·무언가 발견(96px) |
| `src/components/pet/pet-layer.tsx` | 펫 렌더러·상태 머신(끌어 옮기기, 천천히 돌아다니기, 안전 영역, 잠자기, 움직임 줄이기) |
| `src/app/dev/pet/page.tsx` | 펫 시험 페이지(펫 고르기, 펫 보이기, 통계) |
| `src/components/pet/use-pet-prefs.ts` | 펫 설정(오늘의 펫·펫 보이기)을 기기에 저장 → 브라우저를 다시 열어도 유지. 계정이 생기면 DB 저장으로 교체 |
| `Dockerfile`, `.dockerignore`, `docker-compose.yml`(`app` 추가) | 앱 상시 실행 컨테이너(비밀값은 이미지에 넣지 않음) |
| `scripts/update.ps1` | 운영 반영 스크립트(UTF-8 BOM 저장 — Windows PowerShell 5.1 한글 깨짐 방지) |
| `C:\oona-data\backups\` | 업데이트 직전 DB 백업(`pre-update-<시각>.dump`) |
| `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/app/api/auth/[...all]/route.ts` | 인증(Better Auth): 아이디 로그인, Argon2id, 카카오·네이버(키 있을 때만), 명시적 계정 연결 |
| `src/app/dev/auth/page.tsx` | 로그인 시험 페이지(개발용) |
| `scripts/migrate.mts` | 인증 테이블 + 앱 테이블(ai_connection) 만들기·갱신. 업데이트 스크립트가 운영 DB에 자동 실행 |
| `src/lib/ai/`, `src/app/dev/ai/`, `scripts/ai-login.mts`, `scripts/check-ai.mts` | AI 연결(D-060): 엔진 5종(Claude·ChatGPT 구독, Claude·OpenAI·Gemini API 키), 순서대로 시도하는 체인, 키 암호화, 구독 로그인, 시험 화면 |
| DB `oona_dev` | 개발 서버 전용 DB(같은 Postgres 컨테이너). 운영은 `oona` — 개발 시험이 운영 데이터를 건드리지 않음 |
| `.env` 추가 값 | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`(개발 주소). 운영 주소는 docker-compose.yml에서 지정 |
| `next.config.ts` | 보안 헤더, `sw.js` 캐시 금지 |
| `.env` | VAPID 키 추가(`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) |

- 발견: 화면이 가려진 상태에서는 `requestAnimationFrame`이 실행되지 않아 상태 표시가 멈췄다 → 마이크로태스크로 변경. 앱 코드에서도 "다음 프레임에 상태 갱신" 패턴은 피한다.
- 운영 서버 재시작 시 npm을 거치면 자식 프로세스가 남아 포트를 잡는 문제가 있었다 → 상시 실행은 app 컨테이너(M-21)로, 그전까지는 `node node_modules/next/dist/bin/next start`로 직접 실행.

### 우나 전용 노드 연결 방법 (사용자)

1. Tailscale 관리 콘솔 → Settings → Keys → **Generate auth key**. 재사용(Reusable)·임시(Ephemeral)는 끄고 발급.
2. 프로젝트 폴더의 `.env` 파일에서 `TS_AUTHKEY=` 뒤에 발급한 키를 붙여 저장. (키는 채팅에 붙여넣지 말고 파일에 직접 넣기)
3. 연결된 뒤 관리 콘솔 Machines에서 `oona` 기기의 **Disable key expiry**를 켜면 주기적으로 다시 로그인할 필요가 없음.

이후 개발 쪽에서 운영 서버(3331)를 띄우고 `docker compose --profile tailnet up -d`로 노드를 연결한다.

- git 저장소는 아직 만들지 않았다(커밋은 사용자 요청 시).

## 3. 다음 순서 (제안)

1. ~~사용자 인증 키 → 우나 Tailscale 노드 연결 → 휴대폰 접속·설치·푸시(V-01, V-04)~~ 완료
2. 사용자 작업 없이 할 수 있는 V-05·V-06·V-11 진행 (V-05·V-11 완료, 남은 것: V-06 업로드 변환 — fit-pets.mjs의 크기·발 맞춤 재사용 가능)
3. 사용자 준비물이 생기는 대로 V-03·V-07·V-08·V-09·V-13
