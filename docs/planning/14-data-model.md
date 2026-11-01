# 14. 데이터 모델

> 문서 상태: 초안 v0.1 · 작성일 2026-11-01
> 이 문서의 모든 내용은 **내부 구현 정보**이며 화면에 노출하지 않는다. 필드명은 영문 `snake_case`.
> 데이터베이스: PostgreSQL 가정 [제안] → [16 §2](16-architecture-and-operations.md)

## 1. 공통 규칙 [제안]

### 1.1 모든 사용자 데이터 테이블의 공통 열

| 열 | 타입 | 설명 |
|---|---|---|
| `id` | uuid (v7, 시간순) | 기본키. 외부에 노출해도 순서 추측 외 정보 없음 |
| `user_id` | uuid | 소유자. **모든 사용자 데이터에 필수**, 인덱스 |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `deleted_at` | timestamptz null | soft delete 시각 [확정: soft delete] |
| `deleted_by` | uuid null | 삭제한 주체(사용자, 시스템 작업) |
| `delete_batch_id` | uuid null | 함께 삭제된 묶음(부모와 자식을 함께 복구하기 위함) |
| `version` | int | 낙관적 잠금. 수정마다 +1 |
| `source` | text | 생성 출처: `manual`, `wish_purchase`, `recurring_auto`, `ai`, `import`, `sync_google` 등 |

### 1.2 soft delete 규칙 [확정 원칙] [제안: 세부]

- "삭제" = `deleted_at` 설정. 일반 조회는 항상 `deleted_at is null` 조건(공통 데이터 접근 계층에서 강제).
- 고유 제약은 삭제되지 않은 행에만 적용(부분 인덱스: `unique (user_id, name) where deleted_at is null`). 삭제한 분류와 같은 이름으로 새 분류를 만들 수 있다.
- 부모를 삭제하면 자식도 같은 `delete_batch_id`로 함께 soft delete. 복구 시 같은 묶음을 함께 복구.
- 참조만 하는 관계(지출 → 위시)는 함께 삭제하지 않는다. 화면에서 "연결된 항목이 삭제됐어요"로 표시.
- 휴지통 = `deleted_at is not null` 이고 아직 영구 삭제되지 않은 행.
- 휴지통 보존 기간 **90일 후 자동 영구 삭제** [확정 D-048]. 기준은 `deleted_at`. 묶음 삭제(`delete_batch_id`)는 묶음 전체가 같은 날 영구 삭제된다.

### 1.3 soft delete의 예외 (실제 삭제 = hard delete) [확정: 예외 설계 요구]

| 대상 | 이유 | 시점 |
|---|---|---|
| 탈퇴 사용자의 모든 데이터 | 개인정보 완전 삭제 요청 | 유예 14일 후 |
| 휴지통 보존 기간 지난 행 | 보존 정책 | 매일 작업 |
| 사용자가 휴지통에서 `영구 삭제` | 사용자 명시 요청 | 즉시(작업 큐) |
| 건강 기록 영역 완전 삭제 | 민감정보 삭제 요청 | 즉시 |
| AI API 키, 외부 연동 토큰 | 비밀값은 보존 가치 없음, 유출 위험 | 연결 해제 즉시 |
| 세션, 인증 코드, 재설정 토큰 | 일회성 | 만료 즉시(또는 매일 정리) |
| 외부 캘린더에서 가져온 일정 사본 | 원본이 외부에 있음 | 연결 해제·외부 삭제 시 |
| AI 대화 | 사용자 보존 기간 설정 | 기간 만료 시 |
| API 로그·감사 로그 | 보존 정책 §5 | 보존 기간 만료 |

- 영구 삭제 시 해당 행의 **변경 이력과 첨부 파일도 함께 삭제**한다. 감사 로그에는 "무엇을 몇 건 영구 삭제했는지"만 개인정보 없이 남긴다.

### 1.4 변경 이력 (revision) [확정: 변경 이력 관리]

| 열 | 설명 |
|---|---|
| `id`, `user_id` | |
| `entity_type` | 예: `transaction`, `goal` |
| `entity_id` | |
| `action` | `create` / `update` / `delete` / `restore` / `revert` |
| `changed_fields` | 바뀐 필드 이름 목록 |
| `before` | jsonb, 바뀐 필드의 이전 값 |
| `after` | jsonb, 바뀐 필드의 이후 값 |
| `actor` | `user` / `system:<작업 이름>` / `ai` / `sync:<서비스>` |
| `request_id` | API 로그와 연결 |
| `created_at` | |

- 작성 위치: 공통 데이터 접근 계층(애플리케이션)에서 트랜잭션 안에 기록. DB 트리거 방식은 대안 [미결정 Q-140].
- 저장량 절약: 전체 스냅샷이 아니라 바뀐 필드만. 일기 본문 같은 긴 텍스트는 이전 값 전체 저장(차이 저장은 복잡도 대비 이득 작음, 용량 모니터링). [제안]
- 건강 값의 이력도 같은 암호화 규칙을 적용(이력에 평문이 남지 않게).
- 보존: 원본 행이 살아 있는 동안 유지. 원본 영구 삭제 시 함께 삭제. 이력 개수 제한은 두지 않되 항목당 1,000개 초과 시 오래된 것부터 압축(일 단위 1개로) [제안].

### 1.5 감사 로그 (audit log) [제안]

보안·개인정보와 관련된 사건 기록. 사용자 데이터 내용은 넣지 않는다.

| 사건 | 예 |
|---|---|
| 인증 | 로그인 성공·실패, 로그아웃, 세션 폐기, 비밀번호 변경, 재설정 |
| 계정 | 로그인 연결·해제(앱·외부 웹훅), 탈퇴 신청·취소·완료 |
| 권한 | AI 데이터 접근 설정 변경, 건강 잠금 설정 |
| AI 조회 | 도구 호출(영역, 도구 이름, 건수, 대화 ID) |
| 데이터 | 내보내기 요청·다운로드, 영구 삭제(건수), 휴지통 비우기 |
| 외부 연동 | 캘린더 연결·해제, 토큰 갱신 실패 |
| 운영 | 운영자 작업(초대 코드 발급, 사용자 정지) |

열: `id`, `user_id`(null 가능), `event`, `detail`(jsonb, 개인정보 없이), `ip_hash`, `user_agent_summary`, `request_id`, `created_at`.

## 2. 관계 개요

```
users ─┬─ auth_identities (아이디/카카오/네이버)
       ├─ sessions
       ├─ user_settings
       ├─ categories(goal) ── goals ──┬─ goal_progress_adjustments
       │                              └─(연결)─ tracker_items ── tracker_month_items
       │                                                  └── tracker_cells
       ├─ fin_categories ── transactions ──(선택)─ planned_expenses
       │        │               ├─(선택)─ recurring_payments
       │        │               ├─(선택)─ payment_methods ── cards ── card_benefits ── benefit_tiers
       │        │               └─(선택)─ wish_items                         └── benefit_limit_groups
       │        └─ budget_lines ── budgets(월)
       ├─ restraint_months, restraint_entries ──(선택)─ wish_items
       ├─ asset_accounts ── asset_snapshots
       ├─ calendars ── events ── event_exceptions
       │      └─ external_calendar_connections ── external_calendars
       ├─ journal_topics ── journal_entries ── attachments
       ├─ media_works ── media_logs
       ├─ wish_items ── wish_links, attachments
       ├─ health_metrics ── health_records
       ├─ menstrual_cycles
       ├─ pets(custom) ── pet_actions ── attachments
       ├─ pet_preferences
       ├─ ai_connections, ai_conversations ── ai_messages
       ├─ notifications, push_subscriptions
       └─ revisions, audit_logs, export_jobs
```

## 3. 공통 보조 테이블

| 테이블 | 주요 열 | 비고 |
|---|---|---|
| `attachments` | user_id, owner_type, owner_id, storage_key, mime, bytes, width, height, variants(jsonb: thumb/body), sha256, order | 파일 메타. 실제 파일은 파일 저장소(본인 PC 데이터 폴더, 저장소 인터페이스 뒤). 위치 EXIF 제거 후 저장 |
| `idempotency_keys` | user_id, key, request_hash, response(jsonb), created_at | 24시간 보관 후 삭제 |
| `notifications` | user_id, type, title, body, target_url, read_at, created_at | 30일 표시 후 90일 보관 [제안] |
| `push_subscriptions` | user_id, endpoint, keys(jsonb), device_label, last_used_at | 실패(410) 시 삭제 |
| `user_settings` | user_id, timezone, week_start, theme, time_format, seen_hints(jsonb), home_widgets(jsonb), privacy(jsonb), notify(jsonb) | 사용자당 1행 |
| `export_jobs` | user_id, scope(jsonb), format, status, file_key, expires_at | 파일 24시간 후 삭제 |

## 4. 영역별 엔터티

### 4.1 계정

| 테이블 | 주요 열 | 제약 |
|---|---|---|
| `users` | id, username(null — 간편 로그인만 가입 시), display_name, email(null), email_verified_at, status(`active`/`pending_deletion`/`suspended`), deletion_requested_at, role(`user`/`operator`) | `unique(lower(username))`, `unique(lower(email))` 둘 다 null 허용 |
| `auth_identities` | user_id, provider(`password`/`kakao`/`naver`), provider_user_id, password_hash(password만), linked_at, last_login_at | `unique(provider, provider_user_id)`; 사용자당 최소 1개 |
| `sessions` | user_id, token_hash, device_label, ip_hash, created_at, last_seen_at, expires_at, revoked_at | |
| `username_tombstones` | username_hash, created_at | 탈퇴 아이디 재사용 방지 [Q-131] |
| `invites` | code_hash, created_by, used_by, expires_at | 2단계 |
| `oauth_tokens` | user_id, provider(`naver_calendar`/`google_calendar`/`kakao_calendar`), access_token_enc, refresh_token_enc, scope, expires_at | 암호화, 해제 시 hard delete |

### 4.2 (공통 분류)
분류는 영역마다 의미가 달라 테이블을 나눈다: 목표 카테고리(4.3), 돈 분류(4.4), 일기 주제(4.6).

### 4.3 목표·트래커 → [05](05-goals-and-tracking.md)

| 테이블 | 주요 열 | 제약·비고 |
|---|---|---|
| `goal_categories` | user_id, name, icon, sort | `unique(user_id, name) where deleted_at is null` |
| `goals` | user_id, title, horizon(`short`/`mid`/`long`), period_type(`year`/`range`/`none`), start_year, end_year, category_id(null), status(`active`/`done`/`paused`/`dropped`), achieved_at, target_value, unit, auto_link(`none`/`books_finished`/`movies_watched`/`dramas_finished`), memo, sort | period_type=year → start_year=end_year; range → start_year<end_year; none → 둘 다 null |
| `goal_progress_adjustments` | goal_id, delta, note, created_at | 수동 ± 조정 |
| `tracker_items` | user_id, name, color_hex, goal_id(null), sort | color_hex `^#[0-9A-F]{6}$` |
| `tracker_month_items` | user_id, item_id, month(`YYYY-MM` 또는 date 1일), sort | `unique(item_id, month)` — 그 달에 보이는 항목 |
| `tracker_cells` | user_id, item_id, date, done(bool), memo(≤40자) | `unique(item_id, date)`. done=false & memo 비면 행 삭제(빈 칸 = 행 없음) [제안] — 단, 변경 이력은 남김 |

### 4.4 돈 → [06](06-finance.md)

| 테이블 | 주요 열 | 제약·비고 |
|---|---|---|
| `fin_categories` | user_id, kind(`expense`/`income`), name, icon, color_hex, sort, is_hidden, counts_toward_restraint(bool) | 기본 분류 `사치`만 counts_toward_restraint=true [20 §3] |
| `payment_methods` | user_id, kind(`card`/`account`/`cash`/`pay`), name, linked_card_id(null, 간편결제 연결 카드), is_hidden, sort | |
| `cards` | user_id, payment_method_id, issuer, card_type(`credit`/`check`), billing_day, perf_period(`prev_month`/`billing_cycle`), perf_excludes(jsonb), installment_perf(`full`/`monthly`), annual_fee, verified_at, memo | payment_method와 1:1 |
| `card_benefits` | user_id, card_id, target_type(`merchant`/`industry`), targets(text[]), benefit_type(`discount`/`point`/`cashback`), value_type(`percent`/`amount`), value, per_txn_max, min_amount, monthly_limit_type(`amount`/`count`/`none`), monthly_limit, limit_group_id(null), days_of_week(int[]), time_from, time_to, excludes(jsonb), memo, source(`manual`/`ai_parse`) | |
| `benefit_tiers` | benefit_id, min_prev_perf, value_override, limit_override | 전월 실적 구간 |
| `benefit_limit_groups` | user_id, card_id, name, monthly_limit | 통합 한도 |
| `merchant_dictionary` | (전역) name, aliases, industry / (사용자) user_id, name, industry | 전역 사전은 앱 데이터 |
| `transactions` | user_id, type(`expense`/`income`), amount(bigint, 원), is_refund, date, category_id, payment_method_id(null), title, memo, installment_months(1=일시불), planned_expense_id(null), recurring_payment_id(null), recurring_period(null, 'YYYY-MM' 등 결제 회차), wish_item_id(null) | amount > 0; 환불은 is_refund=true로 차감; `unique(recurring_payment_id, recurring_period) where deleted_at is null` (자동 기록 중복 방지) |
| `budgets` | user_id, month, copy_next(bool) | `unique(user_id, month)` |
| `budget_lines` | budget_id, category_id, amount | `unique(budget_id, category_id)` |
| `planned_expenses` | user_id, month, name, amount, manually_done(bool), date(null) | 큰 지출 |
| `recurring_payments` | user_id, name, amount, variable_amount(bool), cycle(`monthly`/`yearly`/`every_n_months`/`weekly`), day_of_month(1~31 또는 0=말일), month_of_year, interval_months, anchor_month, weekday, payment_method_id, category_id, memo, status(`active`/`ending`/`ended`), last_use_date, ended_at, started_at, notify(bool), auto_record(bool) | status=ending ⇒ last_use_date 필수 |
| `restraint_entries` | user_id, month(`YYYY-MM`), date, source(`manual`/`wish_auto`/`wish_dropped`/`wish_picked`), wish_item_id(null), name, amount, reason, image_attachment_id(null), link(null), status(`counted`/`excluded`/`later_bought`), later_bought_tx_id(null) | 이름·금액은 기록 시점 복사본(위시 삭제·가격 변경에 영향 없음). `unique(wish_item_id) where source in (wish_auto, wish_dropped, wish_picked) and status <> 'excluded' and deleted_at is null` — 한 위시는 한 번만 [확정 D-039] |
| `restraint_months` | user_id, month, luxury_total, overage_total, overage_detail(jsonb: 분류별), carried_in, later_bought_total, target, filled, shortfall, carry_out, status(`open`/`closed`), closed_at, stale(bool: 정산 뒤 바뀐 지출 있음) | `unique(user_id, month)`. 이번 달은 계산값을 캐시, 지난 달은 정산 시 고정 |
| `user_settings.restraint` | carry_over(bool, 기본 true), show_candidates_on_wish(bool) | jsonb 안 |
| `asset_accounts` | user_id, name, kind(`deposit`/`savings`/`investment`/`pension`/`real_estate`/`other_asset`/`loan`), memo, sort, is_hidden | |
| `asset_snapshots` | account_id, user_id, date, amount | `unique(account_id, date)` |

### 4.5 일정 → [07](07-calendar.md)

| 테이블 | 주요 열 | 비고 |
|---|---|---|
| `calendars` | user_id, name, color_hex, kind(`local`/`external`), external_calendar_id(null), is_visible, sort | |
| `events` | user_id, calendar_id, title, all_day, start_at, end_at, start_date, end_date(종일), tz, rrule(null), location, memo, reminders(jsonb: 분 단위 배열), external_id, external_etag, external_updated_at, sync_state(`synced`/`pending_push`/`push_failed`), naver_pushed_at | 외부 일정은 external_id로 대응 |
| `event_exceptions` | event_id, original_start, kind(`modified`/`cancelled`), override(jsonb) | 반복 회차 예외 |
| `external_calendar_connections` | user_id, provider(`google`/`naver_caldav`/`kakao`), account_label, mode(`import`/`two_way`), oauth_token_id / credential_enc, status, last_synced_at, error_code | |
| `external_calendars` | connection_id, remote_id, name, color, selected(bool), sync_token, watch_channel_id, watch_expires_at, ctag | |

### 4.6 기록 → [08](08-journal-and-media.md)

| 테이블 | 주요 열 | 비고 |
|---|---|---|
| `journal_topics` | user_id, name, color_hex, icon, sort, is_hidden | |
| `journal_entries` | user_id, date, topic_id(null), title, body_md, mood(null) | 사진은 attachments(owner_type=journal_entry) |
| `media_works` | user_id, kind(`book`/`movie`/`drama`), title, original_title, creators(jsonb: 저자/감독/출연), publisher, year, cover_attachment_id(null), cover_external_url(null), external_ref(jsonb: isbn, tmdb_id, source) | 작품 정보 |
| `media_logs` | user_id, work_id, status(`reading`/`finished`/`dropped`/`watched`/`watching`), start_date, end_date, watched_dates(date[]), rating(numeric 0.5 단위), one_liner, review_md, where_text, from_wish_id(null) | 다시 읽기 = 로그 여러 개 |

### 4.7 위시 → [09](09-wishlist.md)

| 테이블 | 주요 열 | 비고 |
|---|---|---|
| `wish_items` | user_id, kind(`shopping`/`media`), media_kind(null), name, level(`like`/`want`/`need`, 쇼핑만), price(쇼핑은 필수), seen_where, status(`saved`/`bought`/`dropped`/`started`/`finished`), bought_at, dropped_reason, transaction_id(null), media_log_id(null), media_work_id(null), restrained_month(null) | `check (kind <> 'shopping' or price > 0)` — 새 항목부터 적용, 기존 항목은 마이그레이션 때 null 허용 후 화면 경고 [확정: 가격 필요]. `finished` = 작품 위시를 완료 처리해 작품 기록으로 옮김 |
| `wish_links` | wish_id, url, title, image_attachment_id, fetched_at, fetch_status | URL은 저장 전 정규화(추적 파라미터 제거 선택) |
| `wish_level_history` | 변경 이력(revisions)으로 대체 — 별도 테이블 없음 | |

### 4.8 건강 → [10](10-health.md)

| 테이블 | 주요 열 | 비고 |
|---|---|---|
| `health_metrics` | user_id, key(`weight`/`glucose`/custom), name, unit, value_type, target_min, target_max(jsonb: 측정 시점별) | 기본 지표는 첫 사용 시 생성 |
| `health_records` | user_id, metric_id, measured_at, context(`fasting`/`before_meal`/`after_1h`/`after_2h`/`bedtime`/`other`), value_enc, memo_enc | **값·메모 암호화** [Q-041]. 추세 계산은 서버에서 복호화 후 |
| `menstrual_cycles` | user_id, start_date, end_date(null), flow(jsonb: 날짜별), symptoms(text[] enc), memo_enc | |

- 건강 테이블은 별도 스키마(`health`)로 분리해 접근 권한·백업 정책을 따로 줄 수 있게 한다. [제안]

### 4.9 펫 → [11](11-pet-system.md)

| 테이블 | 주요 열 | 비고 |
|---|---|---|
| `pets` | user_id, name, type(`basic_image`/`animated`), size, anchor_x, anchor_y, facing, personality(null), source_attachment_id(ZIP 원본) | 사용자 지정 펫만. 기본 펫은 앱 정적 자산(ID 문자열: `preset:panda` 등) |
| `pet_actions` | pet_id, action(`idle`/`walk`/…), original_attachment_id, sprite_attachment_id, frames, fps, loop, frame_w, frame_h | `unique(pet_id, action)`; idle 필수 |
| `pet_preferences` | user_id, active_pet_ref(`preset:dog` 또는 pets.id), visible, movement(`free`/`stay`/`still`), scale, notify, follow_cursor, hidden_until | 사용자당 1행 |

- 공개 범위 열을 두지 않는다(항상 비공개). 공유 기능 도입 시 추가. [확정: 기본 비공개]

### 4.10 AI → [12](12-ai-assistant.md)

| 테이블 | 주요 열 | 비고 |
|---|---|---|
| `ai_connections` | user_id, provider(`openai`/`anthropic`/`google`), method(`api_key`/`chatgpt_signin`), secret_enc, secret_last4, default_model, status, last_tested_at | 해제 시 hard delete |
| `ai_permissions` | user_id, domain, allowed(bool) | 또는 user_settings.privacy jsonb |
| `ai_conversations` | user_id, title, pet_ref, retention_until | |
| `ai_messages` | conversation_id, user_id, role, content(jsonb: text/choices/confirm_card/evidence), provider, model, tokens_in, tokens_out | 도구 결과 원본은 저장 안 함 |
| `ai_usage_daily` | user_id, date, provider, requests, tokens_in, tokens_out | 집계 |

## 5. 로그와 보존 정책 [확정: API 로그 보관, 용량 우려 시 날짜별 파일 고려] [제안: 정책]

### 5.1 API 로그

| 항목 | 내용 |
|---|---|
| 기록 대상 | 모든 API 요청(정적 파일 제외) |
| 필드 | request_id, 시각, user_id(해시 아님 — 사용자 본인 조회용, 운영자 화면에는 해시로), 메서드, 경로 템플릿(`/api/v1/transactions/:id` — 실제 ID는 별도 필드), 상태 코드, 처리 시간, 요청·응답 바이트, 오류 코드, ip_hash, user_agent 요약, 외부 호출 요약(제공자, 시간, 상태) |
| 미기록 | 요청·응답 본문(기본), 쿠키, 인증 헤더, API 키, 비밀번호, 건강 값 |
| 오류 시 | 검증 오류 필드 이름만(값 없음) |
| 저장 1단계 | DB `api_logs` 테이블(월 단위 파티션) **30일** |
| 저장 2단계 | 매일 새벽 전날 로그를 **날짜별 JSON Lines 압축 파일**(`logs/api/2026/11/2026-11-01.jsonl.gz`)로 데이터 폴더에 옮김(백업 대상에 포함) → **1년 보관** 후 삭제 |
| 이유 | 사용자 제안(날짜별 텍스트 파일)을 채택하되, 최근 30일은 검색·장애 분석이 쉬운 DB에 둔다. 압축 JSON Lines는 텍스트라 열어 볼 수 있고 용량이 1/10 이하 |

### 5.2 보존 기간 표

| 데이터 | 보존 | 이후 |
|---|---|---|
| 사용자 데이터(살아 있는 행) | 무기한 | — |
| 휴지통 | 90일 [확정 D-048] | 영구 삭제 |
| 변경 이력 | 원본과 함께 | 원본 영구 삭제 시 삭제 |
| 감사 로그 | 1년(DB), 이후 3년 압축 파일 [제안] | 삭제 |
| API 로그 | DB 30일 + 파일 1년 | 삭제 |
| AI 대화 | 사용자 선택(30/90일/계속) | 영구 삭제 |
| 알림 | 90일 | 삭제 |
| 세션 | 만료 후 7일 | 삭제 |
| 내보내기 파일 | 24시간 | 삭제 |
| 멱등 키 | 24시간 | 삭제 |
| 백업 | 일일 30일 + 월말 12개월 | 삭제 |

## 6. 영구 삭제와 백업의 관계 [제안]

- 탈퇴·영구 삭제된 사용자·행의 ID를 `purge_ledger`(개인정보 없이 entity_type, entity_id 또는 user_id, purged_at)에 기록한다.
- 백업에서 복원할 때 복원 직후 `purge_ledger`를 다시 적용해 이미 삭제 요청된 데이터가 되살아나지 않게 한다.
- `purge_ledger`는 가장 오래된 백업 보관 기간(12개월)보다 길게 보관한 뒤 삭제.

## 7. 동시성·무결성 [제안]

- 수정 요청은 `version`을 함께 보내고, 다르면 409 충돌(화면: "다른 기기에서 먼저 수정했어요").
- 트래커 칸은 `(item_id, date)` 기준 upsert(마지막 쓰기 우선) — 충돌 응답을 내지 않는다(칸 단위 작은 데이터).
- 금액은 원 단위 정수(bigint). 부동소수 금지.
- 날짜(종일·트래커·지출 날짜)는 `date` 타입(시간대 없음), 시각은 `timestamptz`.
- 외래키는 같은 user_id 안에서만 연결되도록 애플리케이션에서 검증(교차 사용자 참조 방지) + 가능한 곳은 복합 외래키 `(user_id, id)`.

## 8. 인덱스 초안

| 테이블 | 인덱스 |
|---|---|
| transactions | (user_id, date desc) where deleted_at is null; (user_id, category_id, date); (user_id, payment_method_id, date) |
| tracker_cells | unique(item_id, date); (user_id, date) |
| events | (user_id, start_at); (user_id, calendar_id); (calendar_id, external_id) unique |
| journal_entries | (user_id, date desc) |
| media_logs | (user_id, end_date) |
| health_records | (user_id, metric_id, measured_at desc) |
| revisions | (user_id, entity_type, entity_id, created_at desc) |
| audit_logs | (user_id, created_at desc) |
| 전 테이블 | (user_id) where deleted_at is not null — 휴지통 조회 |
