# 15. API 명세

> 문서 상태: 초안 v0.1 · 작성일 2026-11-01
> 내부 구현 문서. 오류 코드·필드명은 화면에 노출하지 않고, 화면 문구는 [03 §9](03-design-system.md#9-문구ux-writing-규칙) 규칙으로 바꿔 보여 준다.

## 1. 원칙 [제안]

| 원칙 | 내용 |
|---|---|
| 형태 | JSON REST, 기본 경로 `/api/v1`. (Next.js Route Handler) |
| 이유 | PWA 오프라인 대기열 재전송, 웹훅 수신, 이후 네이티브 래퍼·다른 클라이언트 재사용에 REST가 단순. 화면 전용 단순 변경은 Server Action을 써도 되지만 **같은 서비스 계층**을 호출해야 한다(권한·이력·로그 규칙 한곳) |
| 인증 | 세션 쿠키. 모든 `/api/v1`은 로그인 필요(인증 경로·웹훅 제외) |
| 데이터 범위 | 서버가 세션 사용자로 범위를 정한다. 요청 본문의 `user_id`는 무시(받지 않음) |
| 검증 | 서버 스키마 검증(zod). 클라이언트 검증은 편의일 뿐 |
| 시간 | 시각은 ISO 8601 UTC(`2026-11-01T05:00:00Z`), 날짜는 `YYYY-MM-DD`, 월은 `YYYY-MM` |
| 금액 | 원 단위 정수 |
| ID | uuid 문자열 |

## 2. 공통 규격

### 2.1 응답 형식

성공(단건):
```json
{ "data": { "id": "…", "version": 3, "...": "..." } }
```

성공(목록):
```json
{ "data": [ ... ], "page": { "next_cursor": "eyJ…", "has_more": true } }
```

오류:
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "입력값을 확인해 주세요",
    "fields": [ { "path": "amount", "rule": "min", "message": "1원 이상 입력해 주세요" } ],
    "request_id": "req_01J…"
  }
}
```

- `message`는 한국어 기본 문구(클라이언트가 그대로 써도 되는 수준). 화면은 코드별 문구 표를 우선한다.

### 2.2 오류 코드

| HTTP | code | 의미 | 화면 처리 |
|---|---|---|---|
| 400 | `VALIDATION_FAILED` | 입력 검증 실패 | 필드 아래 문구 |
| 400 | `BAD_REQUEST` | 형식 오류 | "잠시 후 다시 시도해 주세요" |
| 401 | `UNAUTHENTICATED` | 로그인 필요·세션 만료 | 다시 로그인 Dialog |
| 403 | `FORBIDDEN` | 권한 없음(운영자 기능 등) | |
| 403 | `REAUTH_REQUIRED` | 민감 작업 재인증 필요 | 재인증 Dialog |
| 403 | `AI_PERMISSION_REQUIRED` | AI 영역 접근 꺼짐 | 권한 요청 카드 |
| 403 | `HEALTH_LOCKED` | 건강 잠금 상태 | 잠금 해제 |
| 404 | `NOT_FOUND` | 없음 **또는 다른 사용자 소유**(구분하지 않음) | |
| 409 | `VERSION_CONFLICT` | `version` 불일치 | 충돌 Dialog, 응답에 최신 데이터 포함 |
| 409 | `DUPLICATE` | 고유 제약 위반(같은 이름 분류 등) | 필드 아래 |
| 409 | `IDEMPOTENCY_MISMATCH` | 같은 키 다른 요청 | 내부 오류로 처리 |
| 413 | `PAYLOAD_TOO_LARGE` | 파일·본문 초과 | |
| 422 | `BUSINESS_RULE` | 규칙 위반(마지막 로그인 수단 해제 등), `detail.rule`로 구분 | 규칙별 문구 |
| 429 | `RATE_LIMITED` | 요청 과다, `Retry-After` | "잠시 후 다시 시도해 주세요" |
| 502 | `UPSTREAM_FAILED` | 외부 서비스(AI·구글·검색) 실패, `detail.provider` | 제공자별 문구 |
| 503 | `MAINTENANCE` | 점검 | 점검 화면 |
| 500 | `INTERNAL` | 그 외 | 오류 코드(request_id 앞 8자) 작게 표시 |

### 2.3 목록·페이지

- 커서 방식: `?limit=50&cursor=…`(기본 50, 최대 200).
- 정렬: `?sort=date:desc`. 허용 필드는 엔드포인트별 지정.
- 필터: 쿼리 파라미터(`?from=2026-11-01&to=2026-11-30&category_id=…`).
- 휴지통 포함 조회는 휴지통 엔드포인트에서만.

### 2.4 생성 요청의 멱등성

- 생성(POST) 요청은 `Idempotency-Key` 헤더(클라이언트가 만든 uuid) 필수. 같은 키 재요청 시 첫 응답을 그대로 반환(24시간). 오프라인 대기열 재전송·두 번 탭 중복 방지. [01 NFR-REL-005]

### 2.5 수정과 동시성

- `PATCH`는 바꿀 필드만 + `version`. 서버 version과 다르면 409 `VERSION_CONFLICT` + `data`에 최신 값.
- 예외: 트래커 칸 `PUT`은 version 없이 마지막 쓰기 우선.

### 2.6 삭제·복구

- `DELETE /…/:id` = soft delete. 응답 `{ data: { id, deleted_at, delete_batch_id } }`.
- `POST /…/:id/restore` = 복구(같은 batch 함께).
- 영구 삭제는 휴지통 API에서만(`DELETE /trash/:entity_type/:id`), 재인증 불필요(Alert Dialog로 확인), 휴지통 비우기는 재인증 필요 [제안].

### 2.7 요청 제한 [제안]

| 대상 | 한도 |
|---|---|
| 로그인 | 계정당 5회/5분, IP당 30회/5분 |
| 일반 API | 사용자당 600회/분 |
| AI 대화 | 사용자당 30회/분, 동시 2개 |
| 링크 미리보기·작품 검색 | 사용자당 30회/분 |
| 파일 업로드 URL 발급 | 사용자당 60회/분 |

### 2.8 공통 헤더

| 헤더 | 방향 | 용도 |
|---|---|---|
| `X-Request-Id` | 응답 | 로그 추적 |
| `Idempotency-Key` | 요청 | §2.4 |
| `X-Client-Version` | 요청 | 오래된 PWA 감지 → 새로고침 안내 |
| `X-Timezone` | 요청 | 사용자 설정 없을 때 보조 |

### 2.9 파일 업로드

```
1. POST /api/v1/uploads           { purpose, mime, bytes, sha256 } → { upload_url, storage_key, expires_at }
2. 클라이언트가 upload_url로 파일 전송(PUT, 스트리밍)
   - 본인 PC 운영(D-034): upload_url은 앱 서버 자신의 업로드 경로. 서버가 데이터 폴더에 바로 저장
   - 나중에 클라우드로 옮기면: upload_url만 객체 저장소 서명 주소로 바뀜(클라이언트 코드는 그대로)
3. POST /api/v1/uploads/complete  { storage_key } → 서버가 형식 검증·변환(이미지 리사이즈, 펫 스프라이트 변환)
   → { attachment_id, variants, status: "ready" | "processing" }
4. 리소스 생성·수정 시 attachment_id 연결
```
- purpose: `journal_photo`, `media_cover`, `wish_image`, `pet_image`, `pet_pack`, `receipt`.
- 허용 형식·크기는 purpose별. 서버에서 실제 디코딩으로 형식 확인(확장자 신뢰 안 함).
- 다운로드는 `GET /api/v1/attachments/:id/url?variant=thumb` → 서명 주소(1시간).

## 3. 인증·계정 → [13](13-auth-and-users.md)

| 메서드 | 경로 | 설명 | 비고 |
|---|---|---|---|
| GET | `/api/v1/auth/username-available?u=` | 아이디 사용 가능 여부 | 요청 제한 |
| POST | `/api/v1/auth/signup` | 아이디 가입 `{username, password, display_name?, email?, invite_code?}` | |
| POST | `/api/v1/auth/login` | `{username, password, remember}` | 실패 사유 구분 없음 |
| POST | `/api/v1/auth/logout` | 현재 세션 | |
| GET | `/api/v1/auth/oauth/:provider/start` | 카카오·네이버 인증 시작(state·PKCE) `?intent=login|link` | 리다이렉트 |
| GET | `/api/v1/auth/oauth/:provider/callback` | 콜백 → 로그인 또는 "처음 오셨나요?" 화면으로 | |
| POST | `/api/v1/auth/oauth/complete-signup` | 간편 로그인 신규 가입 확정 | 임시 토큰 |
| POST | `/api/v1/auth/oauth/link-existing` | 간편 로그인 후 기존 아이디 로그인으로 연결 | |
| POST | `/api/v1/auth/reauth` | 재인증(비밀번호 또는 간편 로그인) | 10분 유효 |
| POST | `/api/v1/auth/password/reset-request` | 이메일 재설정 메일 | 존재 여부 비노출 |
| POST | `/api/v1/auth/password/reset` | 토큰 + 새 비밀번호 | |
| GET | `/api/v1/me` | 내 정보·설정 요약 | |
| PATCH | `/api/v1/me` | 표시 이름·이메일 | |
| POST | `/api/v1/me/password` | 비밀번호 변경 | 재인증 |
| GET | `/api/v1/me/identities` | 연결된 로그인 | |
| DELETE | `/api/v1/me/identities/:provider` | 연결 해제 | 마지막 수단이면 422 `last_identity` |
| GET | `/api/v1/me/sessions` | 기기 목록 | |
| DELETE | `/api/v1/me/sessions/:id` | 기기 로그아웃 | |
| POST | `/api/v1/me/deletion` | 탈퇴 신청 | 재인증 |
| DELETE | `/api/v1/me/deletion` | 탈퇴 취소(유예 중) | |

## 4. 홈·공통

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/v1/home?date=` | 켜진 위젯별 요약을 한 번에(위젯별 부분 실패 허용: `widgets.{name}.error`) |
| GET | `/api/v1/search?q=&types=` | 전역 검색(건강 제외 기본) |
| GET | `/api/v1/notifications` | 알림 목록 |
| POST | `/api/v1/notifications/read` | `{ids}` 또는 `{all:true}` |
| GET/PATCH | `/api/v1/settings` | 사용자 설정(테마, 시간대, 위젯, 알림, 개인정보) |
| POST | `/api/v1/push-subscriptions` | 웹 푸시 구독 등록 |
| DELETE | `/api/v1/push-subscriptions/:id` | |

## 5. 목표·트래커 → [05](05-goals-and-tracking.md)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/v1/goals?horizon=&category_id=&status=&year=` | 목록(year: 그 연도 포함 목표) |
| POST | `/api/v1/goals` | 생성 |
| GET/PATCH/DELETE | `/api/v1/goals/:id` | |
| POST | `/api/v1/goals/:id/achieve` | 달성 `{achieved_at?}` |
| POST | `/api/v1/goals/:id/unachieve` | 되돌리기 |
| POST | `/api/v1/goals/:id/adjustments` | 진행률 ± `{delta, note?}` |
| GET/POST | `/api/v1/goal-categories` | |
| PATCH/DELETE | `/api/v1/goal-categories/:id` | 삭제 시 목표는 분류 없음 |
| GET | `/api/v1/tracker/:month` | 그 달 항목·칸 전체 `{items:[…], cells:[{item_id,date,done,memo}]}` |
| POST | `/api/v1/tracker/:month/items` | 항목 추가(새 항목 또는 `{item_id}`로 기존 항목을 그 달에 넣기) |
| POST | `/api/v1/tracker/:month/copy-previous` | 지난달 항목 이어 쓰기 `{item_ids}` |
| PATCH | `/api/v1/tracker-items/:id` | 이름·색·목표 연결 |
| DELETE | `/api/v1/tracker/:month/items/:item_id` | 그 달에서 빼기 |
| DELETE | `/api/v1/tracker-items/:id` | 항목 삭제(모든 달·칸 함께 휴지통) |
| PUT | `/api/v1/tracker-cells/:item_id/:date` | 칸 설정 `{done, memo}` (멱등, 미래 날짜 422 `future_date`) |
| POST | `/api/v1/tracker-cells/batch` | 오프라인 대기열 일괄 `{ops:[…]}` |
| GET | `/api/v1/tracker/stats?item_id=&from=&to=` | 통계 |

## 6. 돈 → [06](06-finance.md)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/v1/transactions?from=&to=&type=&category_id=&payment_method_id=&q=` | 목록 + `summary`(합계) |
| POST | `/api/v1/transactions` | 생성 `{type, amount, date, category_id, payment_method_id?, title?, memo?, installment_months?, planned_expense_id?, recurring_payment_id?, wish_item_id?, is_refund?}` → 응답에 `budget_effect`(이 지출로 분류 예산 상태 변화)와 `restraint_effect`(참아야 할 금액 증가분, 토스트 문구용) |
| GET/PATCH/DELETE | `/api/v1/transactions/:id` | |
| POST | `/api/v1/transactions/bulk` | 일괄 분류·결제수단 변경·삭제 |
| GET | `/api/v1/transactions/suggest?title=` | 내용 → 분류 제안, 고정 지출 후보 |
| GET/POST | `/api/v1/fin-categories` · PATCH/DELETE `/:id` | 삭제 시 `{move_to}` 필요(사용 중이면) |
| GET/POST | `/api/v1/payment-methods` · PATCH/DELETE `/:id` | |
| GET | `/api/v1/budgets/:month` | 예산 + 계산 결과(총, 쓴 돈, 남은 돈, 분류별, 큰 지출, 고정 지출 합계) |
| PUT | `/api/v1/budgets/:month` | 예산 전체 저장 `{lines:[{category_id, amount}], planned:[…], copy_next}` |
| POST | `/api/v1/budgets/:month/copy-previous` | 지난달 복사 |
| GET | `/api/v1/recurring-payments?status=` | 목록 + 다음 결제일(계산) |
| POST | `/api/v1/recurring-payments` | 생성 |
| GET/PATCH/DELETE | `/api/v1/recurring-payments/:id` | |
| POST | `/api/v1/recurring-payments/:id/schedule-end` | 해지 예정 `{last_use_date}` |
| POST | `/api/v1/recurring-payments/:id/cancel-end` | 해지 예정 취소 |
| POST | `/api/v1/recurring-payments/:id/end-now` | 바로 해지됨 |
| POST | `/api/v1/recurring-payments/:id/reactivate` | 다시 이용 |
| GET | `/api/v1/recurring-payments/upcoming?days=7` | 결제·해지 예정 |
| GET/POST | `/api/v1/cards` · GET/PATCH/DELETE `/:id` | 카드 상세 응답에 이번 달 실적·적용 구간·혜택별 사용량 |
| POST | `/api/v1/cards/:id/benefits` · PATCH/DELETE `/api/v1/card-benefits/:id` | |
| POST | `/api/v1/cards/:id/benefits/parse` | AI 붙여넣기 정리 `{text}` → 혜택 초안 목록(저장 안 함) |
| POST | `/api/v1/cards/:id/benefits/bulk` | 초안 중 선택 저장 |
| POST | `/api/v1/cards/recommend` | `{merchant?, industry?, amount?, at?, context?}` → 카드별 예상 혜택 순위(§06 6.5). AI 도구와 같은 엔진 |
| GET | `/api/v1/restraint/:month` | 참아야 할 금액(내역 포함)·참은 금액·부족분·목록·이번 달 후보(합계, 가격 없는 위시 수)·정산 상태 → [20](20-restraint-spending.md) |
| POST | `/api/v1/restraint/entries` | 직접 기록 `{date, name, amount, reason?, image_attachment_id?, link?, wish_item_id?}` (wish_item_id 있으면 source=wish_picked) |
| PATCH/DELETE | `/api/v1/restraint/entries/:id` | 수정·삭제(휴지통) |
| POST | `/api/v1/restraint/entries/:id/exclude` | 위시 자동 항목을 그 달에서 빼기 (`/include`로 되돌리기) |
| POST | `/api/v1/restraint/:month/recalculate` | 지난 달 다시 정산(정산 뒤 지출·예산이 바뀐 경우) |
| GET/PATCH | `/api/v1/restraint/settings` | 부족분 넘기기 등 |
| GET/POST | `/api/v1/asset-accounts` · PATCH/DELETE `/:id` | |
| POST | `/api/v1/asset-accounts/:id/snapshots` · `/api/v1/asset-snapshots/bulk` | |
| GET | `/api/v1/assets/summary?from=&to=` | 순자산 추이 |
| GET | `/api/v1/finance/stats?month=` | 분류별·전월 대비 |
| POST | `/api/v1/imports/transactions` | CSV 가져오기(P2): 업로드 → 매핑 → 미리보기 → 확정 |

## 7. 일정 → [07](07-calendar.md)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/v1/events?from=&to=&calendar_ids=&overlays=` | 기간 내 회차 펼친 목록 + 오버레이 항목(`overlays=recurring,media,cycle`) |
| POST | `/api/v1/events` | 생성 `{…, push_to_naver?}` |
| GET | `/api/v1/events/:id?occurrence=` | |
| PATCH | `/api/v1/events/:id` | `{scope: "this"|"following"|"all", occurrence_start?, …}` |
| DELETE | `/api/v1/events/:id?scope=&occurrence=` | |
| GET/POST | `/api/v1/calendars` · PATCH/DELETE `/:id` | |
| GET | `/api/v1/calendar-connections` | |
| GET | `/api/v1/calendar-connections/:provider/start` | 구글·카카오 인증 시작 |
| GET | `/api/v1/calendar-connections/:provider/callback` | |
| POST | `/api/v1/calendar-connections/naver-caldav` | 고급 연결(본인 전용) `{username, app_password}` → 연결 테스트 후 저장 |
| PATCH | `/api/v1/calendar-connections/:id` | 모드·선택 캘린더 |
| POST | `/api/v1/calendar-connections/:id/sync` | 지금 가져오기 |
| DELETE | `/api/v1/calendar-connections/:id` | 해제(외부 사본 hard delete) |
| POST | `/api/v1/events/:id/retry-push` | 외부 보내기 재시도 |

## 8. 기록: 일기·작품 → [08](08-journal-and-media.md)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/v1/journal?from=&to=&topic_id=&q=` | 목록(본문 앞부분) |
| GET | `/api/v1/journal/day/:date` | 날짜별 모음 + `day_summary`(지출·트래커·작품) |
| POST | `/api/v1/journal` · GET/PATCH/DELETE `/:id` | 사진은 attachment_ids 순서 배열 |
| GET/POST | `/api/v1/journal-topics` · PATCH/DELETE `/:id` | |
| GET | `/api/v1/media?kind=&status=&from=&to=` | 작품 로그 목록(작품 정보 포함) |
| GET | `/api/v1/media/calendar/:month` | 포스터 캘린더용(날짜별 묶음) |
| GET | `/api/v1/media/search?kind=&q=` | 외부 작품 정보 검색(책: 카카오·네이버, 영상: TMDB) → 결과 + 출처 표시 정보 |
| POST | `/api/v1/media` | 작품 + 첫 로그 생성 |
| GET/PATCH/DELETE | `/api/v1/media/:log_id` | |
| POST | `/api/v1/media/works/:work_id/logs` | 다시 읽기·보기 |

## 9. 위시 → [09](09-wishlist.md)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/v1/wishes?kind=&level=&status=&sort=` | |
| POST | `/api/v1/wishes` · GET/PATCH/DELETE `/:id` | |
| POST | `/api/v1/wishes/link-preview` | `{url}` → `{title, image_url, price?, status}` (SSRF 방지, 5초) |
| POST | `/api/v1/wishes/:id/purchase` | `{transaction?: {...}}` 지출 생성과 상태 변경을 한 트랜잭션으로. transaction 없으면 상태만 |
| POST | `/api/v1/wishes/:id/drop` | `{reason?, record_restraint: true}` — 기본 참은 소비로 기록 |
| POST | `/api/v1/wishes/:id/finish-media` | 작품 위시 완료 처리 `{status: finished|watched, end_date, rating?, one_liner?, review_md?}` → 작품 기록 생성 + 위시 status=finished, 응답에 media_log_id |
| POST | `/api/v1/wishes/:id/reopen` | 다시 담기 |
| POST | `/api/v1/wishes/:id/start-media` | 작품 위시 → 작품 기록 생성 |

## 10. 건강 → [10](10-health.md)

모든 건강 엔드포인트는 잠금 설정 시 `X-Health-Unlock` 토큰(잠금 해제 후 5분 유효) 필요, 없으면 403 `HEALTH_LOCKED`.

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/v1/health/unlock` | 패스키 검증 또는 PIN → 잠금 해제 토큰 |
| GET | `/api/v1/health/summary` | 예정일, 최근 체중·혈당 |
| GET/POST | `/api/v1/health/metrics` · PATCH/DELETE `/:id` | |
| GET | `/api/v1/health/records?metric=&from=&to=` | |
| POST | `/api/v1/health/records` · PATCH/DELETE `/:id` | |
| GET | `/api/v1/health/cycles` | 주기 목록 + 예측 |
| POST | `/api/v1/health/cycles` · PATCH/DELETE `/:id` | |
| POST | `/api/v1/health/cycles/start-today` · `/end-today` | 빠른 기록 |
| DELETE | `/api/v1/health/all` | 건강 기록 영구 삭제(재인증) |

## 11. 펫 → [11](11-pet-system.md)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/v1/pets` | 기본 5종 + 내 펫 목록(동작별 스프라이트 서명 주소) |
| POST | `/api/v1/pets` | 사용자 지정 펫 생성 `{name, type, actions:{idle: attachment_id, …}}` 또는 `{pack_attachment_id}` |
| GET/PATCH/DELETE | `/api/v1/pets/:id` | |
| PUT | `/api/v1/pets/:id/actions/:action` | 동작 파일 교체 |
| DELETE | `/api/v1/pets/:id/actions/:action` | idle 삭제 불가(422 `idle_required`) |
| POST | `/api/v1/pets/validate-pack` | ZIP 검사만(저장 안 함) → 오류·경고 목록 |
| GET/PATCH | `/api/v1/pet-preferences` | 오늘의 펫, 움직임, 크기, 알림, 숨기기 |
| GET | `/api/v1/pets/sample/:type` | 샘플 파일 |

## 12. AI → [12](12-ai-assistant.md)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/v1/ai/connections` | 연결 목록(키 끝 4자리만) |
| POST | `/api/v1/ai/connections/test` | `{provider, method, secret}` → 성공·모델 목록(저장 안 함) |
| POST | `/api/v1/ai/connections` | 저장(암호화) |
| PATCH | `/api/v1/ai/connections/:id` | 기본 모델 |
| DELETE | `/api/v1/ai/connections/:id` | hard delete |
| GET/PATCH | `/api/v1/ai/permissions` | 영역별 허용 |
| GET | `/api/v1/ai/conversations` · POST · PATCH/DELETE `/:id` | |
| POST | `/api/v1/ai/conversations/:id/messages` | 메시지 전송 → **스트리밍 응답**(SSE). 이벤트: `text`, `tool_status`(조회 중 표시), `choices`, `confirm_card`, `evidence`, `permission_request`, `error`, `done` |
| POST | `/api/v1/ai/conversations/:id/stop` | 생성 멈추기 |
| POST | `/api/v1/ai/confirm-cards/:id/accept` | 확인 카드 저장 → 해당 리소스 생성 API 내부 호출 |
| POST | `/api/v1/ai/conversations/:id/grant` | `이번만 허용` `{domain}` |
| GET | `/api/v1/ai/usage?month=` | P2 |

## 13. 설정·데이터 관리

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/v1/trash?entity_type=&cursor=` | 휴지통 |
| POST | `/api/v1/trash/restore` | `{items:[{entity_type, id}]}` |
| DELETE | `/api/v1/trash/:entity_type/:id` | 영구 삭제 |
| DELETE | `/api/v1/trash` | 휴지통 비우기(재인증) |
| GET | `/api/v1/revisions?entity_type=&entity_id=` | 변경 기록(필드 라벨 변환은 클라이언트) |
| POST | `/api/v1/revisions/:id/revert` | 이 상태로 되돌리기 |
| GET | `/api/v1/security-log?cursor=` | 보안 기록(감사 로그 중 본인 것) |
| POST | `/api/v1/exports` | 내보내기 작업 시작(재인증) |
| GET | `/api/v1/exports/:id` | 상태·다운로드 주소 |

## 14. 웹훅(외부 → 앱)

> **현재 운영(본인 PC + Tailscale 사설망, D-043)에서는 외부 서비스가 앱에 접근할 수 없어 아래 웹훅은 받지 못한다.** 엔드포인트는 클라우드 이전(3단계) 또는 Funnel 사용(Q-164)을 위해 만들어 두되 기본 꺼짐. 대체 처리: 카카오·네이버는 다음 로그인 실패 시 연결 끊김 처리(13 §4.3), 구글은 주기 동기화(07 §4.2).


| 경로 | 보낸 곳 | 검증 | 응답 |
|---|---|---|---|
| `POST /api/webhooks/kakao/unlink` (GET도 허용) | 카카오 연결 끊기 | `Authorization: KakaoAK {어드민 키}` 비교 | **3초 안 200**(오류여도 200), 처리는 비동기 |
| `POST /api/webhooks/naver/unlink` | 네이버 연결 끊기 알림 | clientId 확인, encryptUniqueId 복호화 | 204 |
| `POST /api/webhooks/google/calendar` | 구글 캘린더 푸시 | 채널 ID·토큰(`X-Goog-Channel-Token`) 대조 | 200, 이후 syncToken 조회 작업 등록 |

## 15. 예약 작업 (서버)

| 작업 | 주기 | 내용 |
|---|---|---|
| `recurring.daily` | 매일 00:10 (사용자 시간대별 묶음) | 해지 예정 → 해지됨 전환, 자동 기록 생성(09:00 큐) |
| `restraint.monthly_close` | 매월 1일 00:30 | 지난달 참은 소비 정산: 참아야 할 금액 확정, 위시 자동 포함, 부족분 넘기기, 결과 알림·펫 [20 §6] |
| `notify.dispatch` | 매분 | 예정된 알림(일정 n분 전, 결제 1일 전 등) 웹 푸시·알림 센터 |
| `calendar.poll` | 15분 | 구글(푸시 없는 연결)·CalDAV 변경 가져오기 |
| `calendar.watch_renew` | 매일 | 만료 임박 구글 채널 재등록 (Tailscale 운영에서는 G3를 쓰지 않으므로 꺼짐) |
| `ops.heartbeat` | 5분 | 하트비트 감시 서비스로 신호 전송(서버 꺼짐 알림용) [16 §5.4] |
| `trash.purge` | 매일 03:00 | 보존 기간 지난 휴지통 영구 삭제 |
| `account.purge` | 매일 03:30 | 유예 끝난 탈퇴 계정 영구 삭제 |
| `logs.archive` | 매일 04:00 | 전날 API 로그 → 날짜별 압축 파일, 30일 지난 DB 파티션 삭제 |
| `logs.expire` | 매일 | 1년 지난 로그 파일 삭제 |
| `ai.retention` | 매일 | 보존 기간 지난 대화 삭제 |
| `cleanup.ephemeral` | 매시 | 세션·멱등 키·내보내기 파일·업로드 미완료 파일 정리 |
| `backup.verify` | 매주 | 최신 백업 무결성 확인(복원 리허설은 분기 수동) |

- 모든 작업은 멱등이어야 한다(두 번 실행돼도 같은 결과). 실행 기록을 `job_runs`에 남긴다.
- **따라잡기**: 본인 PC 운영(D-034)이라 PC가 꺼져 있던 동안 작업이 빠질 수 있다. worker가 시작할 때 각 작업의 마지막 성공 시각을 보고 빠진 날짜를 순서대로 실행한다. 지난 알림은 푸시하지 않고 알림 센터의 "놓친 알림"으로만 남긴다. [16 §5.5]
- 실행기: pg-boss 예약 작업(worker 프로세스). [16 §2]
