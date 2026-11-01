# 19. 외부 연동 실현 가능성 조사

> 조사일 2026-11-01 · 조사 방식: 공식 문서·2차 자료 웹 조사
> 이 문서는 07(일정), 06(카드 혜택), 08(작품 검색), 12(AI), 13(로그인), 16(PWA)의 [검증 필요] 항목 판단 근거다.
> 표기: **[확인]** 공식 문서에서 직접 확인 / **[2차]** 블로그·기사·포럼으로만 확인 / **[미확인]** 확인하지 못함.
> 외부 서비스 정책은 자주 바뀐다. 구현 직전에 다시 확인한다.

---

## 1. 구글 캘린더 API

### 1.1 권한 범위(scope) [확인]
출처: https://developers.google.com/workspace/calendar/api/auth

| 범위 | 용도 | 이 앱에서 |
|---|---|---|
| `calendar.events.readonly` | 일정 읽기 | 1차(가져오기) |
| `calendar.calendarlist.readonly` | 캘린더 목록 읽기 | 1차 |
| `calendar.events` | 모든 캘린더 일정 읽기·쓰기 | 2차(양방향) |
| `calendar.events.owned` | 소유한 캘린더만 읽기·쓰기 | 2차 대안(범위 축소) |
| `calendar.app.created` | 앱이 만든 보조 캘린더만 | "앱 전용 캘린더" 방식 대안 |
| `calendar` | 전체 권한 | 사용하지 않음(최소 권한) |

- 캘린더 범위는 "sensitive" 등급이며 "restricted"가 아니어서 CASA 보안 평가 대상이 아니다. [2차] 공식 분류표 원문은 [미확인].

### 1.2 증분 동기화 [확인]
출처: https://developers.google.com/workspace/calendar/api/guides/sync
- 첫 전체 조회의 마지막 페이지에 `nextSyncToken`. 이후 `syncToken`으로 변경분만 받는다. 삭제된 항목도 포함된다.
- `syncToken`과 함께 쓸 수 있는 파라미터가 제한된다. 첫 요청부터 같은 파라미터 조합을 유지해야 한다.
- **410 Gone** 응답 → 토큰 무효. 로컬 사본을 비우고 전체 재동기화.

### 1.3 푸시 알림(watch 채널) [확인]
출처: https://developers.google.com/workspace/calendar/api/guides/push
- 수신 주소는 유효한 인증서의 HTTPS여야 한다. **localhost에서는 받을 수 없다**(배포 도메인 또는 터널 필요).
- 도메인 소유권 검증 필요 여부는 [미확인] (현행 문서에 언급 없음).
- 만료 시점은 요청값과 내부 한도 중 짧은 쪽. **자동 갱신 없음** → 만료 전 새 채널 등록(서버 예약 작업).
- 알림에는 본문이 없다. 알림을 받으면 `syncToken`으로 변경분을 조회한다.

### 1.4 반복 일정 [확인]
출처: https://developers.google.com/workspace/calendar/api/guides/recurringevents
- `recurrence`에 RRULE. 개별 회차는 `events.instances()` 또는 `singleEvents=true`.
- 회차는 `recurringEventId` + `originalStartTime`으로 식별. 한 회차 수정 = 예외 생성, 회차 삭제 = `status: cancelled`.
- "이후 모든 일정" 수정은 회차별로 처리하지 말라고 권고(분할 방식 설명은 없음).

### 1.5 OAuth 앱 게시 상태 [확인]
출처: https://developers.google.com/identity/protocols/oauth2 , https://support.google.com/cloud/answer/7454865
- **Testing 상태 + External 사용자 유형이면 refresh token이 7일 후 만료**(기본 프로필 범위만 요청하면 예외).
- 계정·클라이언트당 refresh token 100개 한도, 6개월 미사용 토큰 무효화.
- 검증받지 않은 앱은 신규 사용자 100명 한도(프로젝트 수명 전체, 초기화 안 됨). 검증에는 수개월 걸릴 수 있다.
- **이 앱에 주는 의미**: 1단계(본인)는 Production으로 게시하되 검증 없이 사용 → "확인되지 않은 앱" 경고는 뜨지만 7일 만료를 피함. 다중 사용자 단계는 sensitive 범위 검증(개인정보처리방침, 도메인, 시연 영상) 필요.

### 1.6 쿼터·비용
- 프로젝트당 분당 10,000건, 사용자당 분당 600건(2026-05-01 기준). 초과 시 403/429. [확인] https://developers.google.com/workspace/calendar/api/guides/quota
- 과금 여부는 출처가 엇갈린다(무료 / 2026년 후반 한도 초과분 과금 예정). **[미확인] 콘솔에서 직접 확인.**

---

## 2. 네이버 캘린더

### 2.1 공식 API: 일정 추가만 [확인]
출처: https://developers.naver.com/docs/login/calendar-api/calendar-api.md , https://github.com/naver/naver-openapi-guide
- `POST https://openapi.naver.com/calendar/createSchedule.json` (네이버 로그인 토큰 필요)
- 파라미터: `calendarId`(기본 `defaultCalendarId`), `scheduleIcalString`(iCalendar 문자열, RRULE 가능)
- **조회·수정·삭제 API 없음.**

### 2.2 CalDAV [2차]
출처: https://extrememanual.net/41175 , https://extrememanual.net/39613
- 서버 `caldav.calendar.naver.com`, 사용자 이름 = 네이버 ID, 비밀번호 = 2단계 인증 후 발급하는 **애플리케이션 비밀번호**.
- 조회·등록·삭제 가능. 단 개발자용 API가 아닌 일반 캘린더 앱용 프로토콜이며, 개발자 대상 약관·지원은 [미확인].

### 2.3 ICS 구독 주소 [미확인]
- 개인 네이버 캘린더의 iCal 구독 주소 발급 경로를 찾지 못했다(NAVER WORKS 문서만 확인됨).

### 2.4 판단
- 1단계(본인): CalDAV + 본인 앱 비밀번호를 서버에 암호화 저장하는 방식은 기술적으로 가능하나 비공식 경로이며 자격증명 보관 부담이 있다.
- 다중 사용자: 타인의 앱 비밀번호 수집은 보안·약관 위험이 커서 제공하지 않는다. 공식 경로는 "앱 → 네이버로 일정 추가(단방향)"뿐.

---

## 3. 카카오 로그인 · 네이버 로그인

### 3.1 카카오 [확인]
출처: https://developers.kakao.com/docs/ko/kakaologin/utilize , /prerequisite , /callback , /getting-started/quota
- 닉네임·프로필 사진: 기본 제공. **이메일: 비즈 앱 필요.** 이름·성별·연령대·생일·전화번호 등: 추가 기능 신청·심사.
- 사업자 없이 **개인 개발자 비즈 앱 전환** 가능, 이메일을 선택 동의로 설정 가능. [2차] https://devtalk.kakao.com/t/id-1518174/150746
- 동의항목 심사 영업일 3~5일.
- Redirect URI 등록 필수(불일치 `KOE006`). 로그아웃 리다이렉트 URI 최대 10개, 80/443 포트. 로그인 리다이렉트 URI의 localhost 허용·개수 한도는 [미확인].
- **연결 끊기 웹훅**: 사용자가 카카오 쪽에서 연결을 끊었을 때만 발송(앱이 직접 unlink하면 안 옴). `app_id`, `user_id`, `referrer_type` 전달, `Authorization: KakaoAK {어드민 키}`로 출처 검증, **3초 안에 200 응답**(오류여도 200).
- 쿼터: 토큰 발급 사용자당 10분 20회, 전체 API 월 300만 건.

### 3.2 카카오 톡캘린더 [확인]
출처: https://developers.kakao.com/docs/ko/talkcalendar/common
- 일정 생성·조회·수정·삭제, 할 일, 서브 캘린더(서비스당 최대 3개).
- 권한 신청 전에는 **앱 팀 멤버만** 호출 가능 → **본인이 팀 멤버인 1단계에서는 심사 없이 사용 가능.**
- 일반 사용자 제공 시 `talk_calendar` 동의항목 + 권한 심사(이용 흐름·화면 캡처 요구). [2차] 비즈 앱 필요 여부 [미확인]. 일 30,000건.

### 3.3 네이버 로그인 [확인]
출처: https://developers.naver.com/docs/login/devguide/devguide.md , /verify/verify.md
- 제공 정보: 식별자(앱별 고유), 이름, 닉네임, 프로필 이미지, 이메일, 생일, 연령대, 성별, 출생연도, 휴대전화. 식별자 외는 사용자가 거부 가능.
- '개발 중' 상태: 등록자 + 멤버 관리에 등록한 ID만 로그인. 외부 사용자에게 열려면 **검수**(영업일 2~3일). 식별자 외 항목은 실제 활용처 캡처 증빙. 휴대전화 요청 시 사업자 확인 추가.
- **네이버 로그인 가입 과정에서 서비스 고유의 별도 비밀번호를 요구하면 검수 반려.** → 간편 로그인 가입자에게 아이디·비밀번호 생성을 강요하지 않는다.
- Callback URL 정확히 일치해야 함.
- 연동 해제: `grant_type=delete` 토큰 폐기. **연결 끊기 알림**: "연결끊기 Callback URL" 등록 시 사용자가 네이버에서 동의 철회·탈퇴하면 POST로 `clientId`, `encryptUniqueId`, `timestamp` 전달, 204 응답.
- 계정 연결 권고: 이메일만으로 자동 병합하지 말고 로그인 상태에서 명시적으로 연결. `(provider, provider_user_id)` 고유키.

---

## 4. AI 제공자 접근

### 4.1 소비자 구독과 API는 별개 [확인]
| 제공자 | 구독(웹) | API |
|---|---|---|
| OpenAI | ChatGPT Plus/Pro는 API 사용 미포함. Pro·Business에 프로모션 API 크레딧 있음 | 별도 결제 https://help.openai.com/en/articles/9039756 |
| Anthropic | Pro/Max/Team은 Console API 미포함. **Max·Team은 월 API 크레딧 제공**(Max 5x $100, Max 20x $200), Pro는 대상 아님 | https://support.claude.com/en/articles/17154008 |
| Google | AI Pro/Ultra는 AI Studio 한도만 상향. Gemini API는 Cloud Billing 별도. **무료 등급 API 키 있음** | https://ai.google.dev/gemini-api/docs/google-ai-plans |

### 4.2 로컬 도구에서 구독으로 로그인
- **Codex CLI** [확인] https://learn.chatgpt.com/docs/auth : "Sign in with ChatGPT"는 플랜 사용량 사용. 자격증명 `~/.codex/auth.json`(평문) 또는 키체인. "신뢰할 수 없거나 공개된 환경에 노출하지 말라", 일반 API 호출에는 Platform API 키를 쓰라고 안내.
- **Claude Code / Agent SDK** [확인] https://code.claude.com/docs/en/legal-and-compliance : 구독 OAuth는 Claude Code·Anthropic 네이티브 앱의 일반적 사용 전용. **제품·서비스를 만드는 개발자는 API 키를 써야 함.** 서드파티 앱의 Claude.ai 로그인 제공, 사용자 대신 구독 자격증명으로 요청 중계, 자격증명·세션 토큰 수집·저장·중계 **금지**. 본인이 수정하지 않은 Claude Code에 본인 구독으로 로그인해 쓰는 것은 허용. 구독 로그인 Agent SDK·`claude -p` 사용량은 현재 구독 한도에서 차감(https://support.claude.com/en/articles/15036540).
- **Gemini CLI** [확인] https://geminicli.com/docs/resources/tos-privacy : 서드파티 도구가 Gemini CLI OAuth에 편승하는 것은 **약관 위반·계정 정지 사유**. AI Studio·Vertex API 키 권장.

### 4.3 "제공자 계정으로 로그인해 플랜 사용" (OAuth)
- **OpenAI만 제공** [확인] https://developers.openai.com/siwc : "Sign in with ChatGPT" + 플랜 사용(token sharing). Responses API 한정, Plus·Pro 사용자. **오픈소스·로컬 호스팅 앱은 동적 등록 흐름**(https://developers.openai.com/siwc/token-sharing-open-source), **유료이거나 원격 호스팅 앱은 관심 신청 후 선별 파트너만**(https://developers.openai.com/siwc/request-client-id). 2026-09-29 발표.
- Anthropic·Google: 제공하지 않음(Anthropic은 명시적 금지).

### 4.4 API 키 [미확인·관행]
- 통용 접두사: OpenAI `sk-`/`sk-proj-`, Anthropic `sk-ant-`, Google `AIza`. 공식 형식 명세는 확인 못 함 → 형식 검사는 경고만, 판정은 실제 연결 테스트로.

---

## 5. 국내 신용카드 혜택 데이터

- **공개 오픈 API 없음** [2차] https://velog.io/@julia_heo/ONCE-1 : 공공데이터포털은 카드사 기본 정보 수준. 금융결제원 API는 사업자·계약 필요. 신한 Open API는 자사 카드만. 토스페이먼츠 카드 혜택 조회는 결제 프로모션용.
- CODEF: 스크래핑 기반 중계 API, 보유 카드·혜택·실적 조회 가능, 개인 유료 개발자 모드 있다고 함. 요금·조건 [미확인].
- 카드고릴라 공개 API [미확인] (찾지 못함). 크롤링은 약관 위반·DB 무단 복제 위험. [2차]
- **마이데이터**: 금융위 허가, 최소 자본금 5억 원 등 요건. 무허가 영업 형사처벌. 개인 앱은 사실상 불가. [2차] https://fsc.go.kr/no010101/74324
- **결론**: ① 직접 입력 ② 카드사 안내 문구 붙여넣기 → AI 구조화 → 사용자 확인 후 저장 ③ "최종 확인일" 표시. 자동 수집(스크래핑)은 제외.

---

## 6. 작품 정보(표지·포스터)

| 서비스 | 내용 | 한도 | 조건 |
|---|---|---|---|
| 카카오(다음) 책 검색 [확인] | `GET dapi.kakao.com/v3/search/book`, ISBN·표지·저자·출판사 | 하위 서비스당 일 30,000건 | 출처 표시 의무 [미확인] |
| 네이버 책 검색 [확인] | `openapi.naver.com/v1/search/book.json`, 상세 검색(ISBN), 표지·ISBN | 검색 API 합산 일 25,000건 | 출처·캐싱 제한 [미확인] |
| TMDB [확인] | 영화·드라마, `ko-KR` 언어 | 약 초당 40건 | **비상업 무료, 상업은 서면 계약**. TMDB 로고 + "This product uses the TMDB API but is not endorsed or certified by TMDB." 표시. **6개월 초과 캐싱 금지, 이미지 호스팅 용도 금지** |
| KOBIS [2차] | 한국 영화 목록·상세 | [미확인] | 포스터 제공 [미확인] (일반적으로 미제공) |

**이 앱에 주는 의미**: 포스터는 TMDB 이미지 주소를 참조로 쓰고, 사용자가 "내 기록에 저장"할 때 본인 계정의 첨부 이미지로 보관하는 방식은 TMDB "이미지 호스팅 금지" 조항과 충돌할 수 있다 → [18 Q-061](18-decisions-and-open-questions.md)에서 결정. 1단계는 비상업 개인 사용.

---

## 7. PWA (2026)

- **iOS 웹 푸시** [확인·2차]: iOS 16.4+, **홈 화면에 추가한 웹앱에서만**. 권한 요청은 사용자 동작(탭)에 대한 응답으로만. 매니페스트 `display: standalone`. iOS 18.4+ Declarative Web Push(서비스 워커 없이 표시, `userVisibleOnly` 필수, 무음 푸시 금지). https://webkit.org/blog/16535/meet-declarative-web-push/
- **저장소** [확인]: Safari origin 쿼터 디스크 최대 60%, 홈 화면 웹앱 동일. 기본 best-effort, 오래 안 쓴 origin부터 삭제. `persist()`는 휴리스틱(홈 화면 웹앱이면 승인 가능성 높음). 7일 스크립트 저장소 삭제는 홈 화면 웹앱에 사실상 적용 안 됨. **설치한 PWA는 Safari와 저장소·로그인 세션을 공유하지 않음.** https://webkit.org/blog/14403/updates-to-storage-policy/
- **Background Sync** [확인]: Chrome 계열만. **iOS Safari·Firefox 미지원.** → 오프라인 대기열은 "앱을 다시 열 때 전송"으로 설계, 정시 알림은 반드시 서버 Web Push. https://caniuse.com/background-sync

---

## 8. 결론이 기획에 반영된 위치

| 결론 | 반영 |
|---|---|
| 구글 캘린더 양방향 가능, 7일 토큰 만료·검증 일정 고려 | [07 §4](07-calendar.md) |
| 네이버 공식은 추가만, CalDAV는 본인 전용 고급 옵션 | [07 §5](07-calendar.md) |
| 카카오 톡캘린더는 1단계 본인 사용 가능 | [07 §6](07-calendar.md) |
| 카카오 이메일은 비즈 앱, 네이버 별도 비밀번호 요구 금지 | [13](13-auth-and-users.md) |
| AI는 API 키가 정석, 구독 사용 경로는 제공자별로 다름 | [12 §3](12-ai-assistant.md) |
| 카드 혜택은 직접 입력 + AI 붙여넣기 구조화 | [06 §6](06-finance.md) |
| 포스터는 TMDB, 책은 카카오/네이버 검색 | [08 §5](08-journal-and-media.md) |
| iOS는 홈 화면 설치 후 푸시, 백그라운드 동기화 없음 | [16 §3](16-architecture-and-operations.md) |
