# Cursor Prompt Injection Spec — Neon Cat Shortform Dark Player

> **용도:** 아래 블록 전체를 다음 Cursor 세션에 그대로 붙여넣어 구현을 지시한다.  
> **에셋:** `neoncat.jpg` (본편 비주얼) · `short.jpg` (UI 레퍼런스) · `music.mp3` (오디오)  
> **분석 기준일:** 2026-08-05 · 소스 `neoncat.jpg` 1248×832 → 중앙 9:16 크롭 468×832 (x0=390)

---

## 0. Cursor에게 전달할 한 줄 지시

```
아래 명세 그대로 모바일 숏폼 웹 플레이어(다크모드)를 구현하라.
에셋 neoncat.jpg를 중앙 9:16 스테이지에 object-fit: cover로 올리고,
제공된 CSS 변수·Safe Zone·absolute 좌표를 준수하며,
상단 타이틀 / 우측 인터랙션 바 / 하단 캡션이 고양이 얼굴·헤드폰·DJ 덱을 가리지 않게 배치하라.
short.jpg는 레이아웃 레퍼런스, music.mp3는 오디오 소스로 사용하라.
```

---

## 1. Dark Mode CSS Theme Tokens (HEX JSON)

픽셀 채도 분석 결과(9:16 중앙 크롭 기준): 네온 픽셀의 **66.8%가 Cyan**, 시그니처 포인트는 **Magenta 눈/헤드폰**, 보조 하이라이트는 **Lime EQ 바**.

```json
{
  "Primary": "#FF4FE2",
  "Secondary": "#5CE1FF",
  "Background": "#07080F",
  "Accent": "#C8FF6A"
}
```

### 확장 토큰 (구현 시 CSS 변수로 함께 선언)

```json
{
  "Primary": "#FF4FE2",
  "PrimaryMuted": "#F481D7",
  "Secondary": "#5CE1FF",
  "SecondaryDeep": "#0090D8",
  "Background": "#07080F",
  "BackgroundElevated": "#0F1A3A",
  "SurfaceOverlay": "rgba(7, 8, 15, 0.55)",
  "Accent": "#C8FF6A",
  "AccentViolet": "#A875FD",
  "TextPrimary": "#F5F7FF",
  "TextSecondary": "rgba(245, 247, 255, 0.72)",
  "IconOnMedia": "#FFFFFF",
  "DangerLike": "#FF4FE2",
  "ScrimTop": "rgba(7, 8, 15, 0.72)",
  "ScrimBottom": "rgba(7, 8, 15, 0.78)"
}
```

### CSS 선언 예시

```css
:root {
  --color-primary: #FF4FE2;
  --color-secondary: #5CE1FF;
  --color-background: #07080F;
  --color-accent: #C8FF6A;
  --color-primary-muted: #F481D7;
  --color-bg-elevated: #0F1A3A;
  --color-surface-overlay: rgba(7, 8, 15, 0.55);
  --color-accent-violet: #A875FD;
  --color-text-primary: #F5F7FF;
  --color-text-secondary: rgba(245, 247, 255, 0.72);
  --color-icon-on-media: #FFFFFF;
  --scrim-top: rgba(7, 8, 15, 0.72);
  --scrim-bottom: rgba(7, 8, 15, 0.78);
}
```

| 토큰 | HEX | 추출 근거 |
|------|-----|-----------|
| Primary | `#FF4FE2` | 눈/헤드폰 Magenta 피크 `#FF62F2`~`#F67BF0` → UI용으로 채도 보정 |
| Secondary | `#5CE1FF` | Cyan 패밀리 피크 `#6DDFFE` / `#79F7FF` (네온 지배색) |
| Background | `#07080F` | 암부 평균 `#080709` + Navy `#0F1A3A` 사이 딥 베이스 |
| Accent | `#C8FF6A` | Lime EQ `#CBFF84` / `#C7FF68` |

---

## 2. Player Shell & Media Stage

```
Viewport (full)
└─ .player-shell          /* bg: var(--color-background); min-h: 100dvh */
   └─ .stage              /* centered; aspect-ratio: 9/16; max-h: 100dvh; max-w: min(100vw, 100dvh*9/16) */
      ├─ .media           /* position:absolute; inset:0; object-fit:cover; object-position:center center */
      ├─ .scrim-top       /* gradient overlay for title legibility */
      ├─ .scrim-bottom    /* gradient overlay for caption/deck bleed */
      ├─ .title-bar       /* absolute top */
      ├─ .action-rail     /* absolute right */
      └─ .meta-bar        /* absolute bottom-left */
```

### Stage CSS

```css
.player-shell {
  min-height: 100dvh;
  background: var(--color-background);
  display: grid;
  place-items: center;
}

.stage {
  position: relative;
  aspect-ratio: 9 / 16;
  width: min(100vw, calc(100dvh * 9 / 16));
  height: auto;
  max-height: 100dvh;
  overflow: hidden;
  background: #000;
}

.media {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center center; /* neoncat는 가로원본 → 중앙 크롭 필수 */
}
```

---

## 3. Safe Zone (중요 오브젝트 보호)

9:16 크롭 기준 초점 맵:

| 존 | Y 범위 | X 범위 | 내용 | UI 오버레이 |
|----|--------|--------|------|-------------|
| Title band | 0–12% | 0–100% | 헤드폰 상단·귀 | 타이틀만, 얇은 스크림 |
| Face / Eyes | 18–42% | 25–75% | **핵심 오브젝트** | **금지** |
| Torso safe | 35–68% | 22–78% | 상체·재킷 | 우측 아이콘만 가장자리 |
| DJ Deck | 72–95% | 10–90% | 턴테이블·버튼 | 반투명 캡션만, 불투명 바 금지 |
| Right rail | 48–82% | 78–98% | 비주얼라이저 (busy 0.84) | 아이콘 + 다크 원형 백플레이트 필수 |

### Content Safe Box (미디어 안 중요 피사체가 들어와야 하는 영역)

```
top:    14%
right:  18%
bottom: 28%
left:   8%
```

→ CSS: `padding`이 아니라 **오버레이 배치 제약**으로 해석한다.  
→ 미디어 `object-position`은 `center 42%`까지 허용(얼굴을 살짝 위로). 기본은 `center center`.

---

## 4. Absolute 배치 좌표 마크업 가이드

기준: `.stage` = `position: relative`, 단위는 **% of stage** (px는 safe-area 보조용).  
레퍼런스 `short.jpg`(866×1851)에서 우측 인터랙션은 대략 y≈43%부터, 하단 메타는 y≈87%+.

### 4.1 Top Title Bar

```html
<header class="title-bar">
  <h1 class="title">Neon Alley DJ</h1>
  <p class="subtitle">cyber night set</p>
</header>
```

```css
.title-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 56px; /* 우측 메뉴 점 3개 여유 */
  z-index: 20;
  padding-top: max(12px, env(safe-area-inset-top), 4.5%);
  padding-left: 4.2%;
  padding-right: 3%;
  padding-bottom: 10%;
  background: linear-gradient(180deg, var(--scrim-top) 0%, transparent 100%);
  pointer-events: none;
}
.title-bar * { pointer-events: auto; }

.title {
  margin: 0;
  color: var(--color-text-primary);
  font-size: clamp(14px, 3.6vw, 17px);
  font-weight: 700;
  letter-spacing: 0.01em;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.65);
}

.subtitle {
  margin: 4px 0 0;
  color: var(--color-text-secondary);
  font-size: clamp(11px, 2.8vw, 13px);
}
```

**좌표 요약**
- `top: 0` / `left: 4.2%` / `right: 56px`
- 타이틀 텍스트 baseline ≈ **y 5.5–7%** (귀·헤드폰 위 스크림 안)
- 타이틀 블록 높이 최대 **≈12% of stage** — Face zone(18%+) 침범 금지

### 4.2 Right Action Rail (하트 · 댓글 · 공유)

```html
<nav class="action-rail" aria-label="interactions">
  <button class="action" data-action="like">
    <span class="action-icon"></span>
    <span class="action-count">11.2만</span>
  </button>
  <button class="action" data-action="comment">
    <span class="action-icon"></span>
    <span class="action-count">3187</span>
  </button>
  <button class="action" data-action="share">
    <span class="action-icon"></span>
    <span class="action-count">Share</span>
  </button>
</nav>
```

```css
.action-rail {
  position: absolute;
  right: 3.2%;
  top: 48%;          /* Face zone(≤42%) 아래부터 시작 */
  bottom: 22%;       /* DJ Deck 상단과 충돌 완화 */
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 18px;
  width: 52px;
}

.action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: var(--color-icon-on-media);
  cursor: pointer;
}

.action-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  /* 우측 레일 busy_score 0.84 → 가독성용 다크 백플레이트 필수 */
  background: var(--color-surface-overlay);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08);
  color: var(--color-icon-on-media);
}

.action[data-action="like"].is-active .action-icon {
  color: var(--color-primary);
}

.action-count {
  font-size: 11px;
  font-weight: 600;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
}
```

**아이콘 권장 앵커 (stage %)**

| 버튼 | top % | right % | 비고 |
|------|-------|---------|------|
| Like | 52% | 3.2% | Primary 활성색 `#FF4FE2` |
| Comment | 62% | 3.2% | |
| Share | 72% | 3.2% | DJ Deck 직전에서 종료 |
| (옵션) Music disc | 82% | 3.2% | `music.mp3` 연동 회전 앨범 |

> Face(18–42%)와 Deck(72–95%) 사이를 관통하지 말 것.  
> 아이콘 열 폭 ≈ **stage width의 14%** 를 우측 예약.

### 4.3 Bottom Meta / Interaction Bar

```html
<footer class="meta-bar">
  <div class="profile-row">
    <img class="avatar" alt="" />
    <span class="username">@neoncat_dj</span>
    <button class="follow">Follow</button>
  </div>
  <p class="caption">Rainy rooftop set — ears up.</p>
  <div class="music-row">
    <span class="music-title">music.mp3</span>
  </div>
</footer>
```

```css
.meta-bar {
  position: absolute;
  left: 3.5%;
  right: 18%;        /* action-rail 폭 확보 */
  bottom: 0;
  z-index: 25;
  padding-bottom: max(10px, env(safe-area-inset-bottom), 2.8%);
  padding-top: 14%;
  background: linear-gradient(0deg, var(--scrim-bottom) 0%, transparent 100%);
}

.profile-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.85);
}

.username {
  color: var(--color-text-primary);
  font-weight: 700;
  font-size: 14px;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.75);
}

.follow {
  margin-left: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.12);
  color: var(--color-text-primary);
  font-size: 12px;
  font-weight: 700;
}

.follow:hover,
.follow[aria-pressed="true"] {
  background: var(--color-accent);
  color: #0A0C12;
  border-color: transparent;
}

.caption {
  margin: 0 0 8px;
  color: var(--color-text-primary);
  font-size: 13px;
  line-height: 1.35;
  max-width: 78%;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.75);
}

.music-row {
  color: var(--color-secondary);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

**좌표 요약**
- `left: 3.5%` / `right: 18%` / `bottom: 0`
- 프로필 행 ≈ **y 86–90%**
- 캡션 ≈ **y 90–94%**
- 뮤직 티커 ≈ **y 95–98%**
- DJ Deck glow는 스크림을 통해 비치게 유지 — **불투명 단색 바 금지**

### 4.4 Overlay Scrims

```css
.scrim-top {
  position: absolute;
  inset: 0 0 auto 0;
  height: 18%;
  z-index: 10;
  pointer-events: none;
  background: linear-gradient(180deg, var(--scrim-top), transparent);
}

.scrim-bottom {
  position: absolute;
  inset: auto 0 0 0;
  height: 32%;
  z-index: 10;
  pointer-events: none;
  background: linear-gradient(0deg, var(--scrim-bottom), transparent);
}
```

---

## 5. Padding / Spacing Tokens

```json
{
  "stagePadding": {
    "safeTop": "14%",
    "safeRight": "18%",
    "safeBottom": "28%",
    "safeLeft": "8%"
  },
  "chrome": {
    "titleTop": "max(12px, env(safe-area-inset-top), 4.5%)",
    "titleLeft": "4.2%",
    "actionRight": "3.2%",
    "actionTop": "48%",
    "actionBottom": "22%",
    "actionGap": "18px",
    "metaLeft": "3.5%",
    "metaRight": "18%",
    "metaBottom": "max(10px, env(safe-area-inset-bottom), 2.8%)",
    "iconHit": "44px"
  }
}
```

---

## 6. Motion / Interaction (최소 2–3개)

1. Like: 아이콘 `scale 1 → 1.18 → 1` 220ms + Primary fill  
2. Music disc: `rotate` 선형 8s infinite (재생 중)  
3. Caption/music: 가로 마키 12s linear (overflow 시)

---

## 7. 구현 체크리스트 (Cursor용)

- [ ] `.stage` `aspect-ratio: 9/16`, 뷰포트 중앙 배치
- [ ] `neoncat.jpg` `object-fit: cover` + 중앙 크롭
- [ ] CSS 변수 4종 + 확장 토큰 적용
- [ ] 타이틀이 y&lt;12% 안에만 존재
- [ ] 액션 레일이 y 48–78%, right 3.2%, 다크 원형 백플레이트
- [ ] 메타 바가 left 3.5% / right 18%, 반투명 스크림만 사용
- [ ] Face zone(18–42%, x 25–75%)에 불투명 UI 없음
- [ ] `music.mp3` 오디오 엘리먼트 연결
- [ ] 다크모드 전용 (라이트 테마 분기 불필요)
- [ ] 터치 타겟 ≥ 44×44px

---

## 8. Do / Don't

**Do**
- 아이콘·텍스트에 `text-shadow` 또는 반투명 백플레이트
- Like 활성 = Primary Magenta, Follow hover = Accent Lime, Music = Secondary Cyan
- DJ Deck 네온이 하단 스크림 아래로 비치게 유지

**Don't**
- Face/Eyes 위에 뱃지·칩·카드 오버레이
- 하단 불투명 솔리드 바
- 우측 아이콘을 스크림/백플레이트 없이 네온 EQ 위에 직접 배치
- Inter / Roboto / Arial / system 기본 스택만으로 타이포 구성 (디스플레이용 개성 폰트 1종 + UI 폰트 1종)

---

## 9. 한 방에 복붙하는 Cursor 프롬프트

```
너는 모바일 숏폼 웹 플레이어를 구현하는 프론트엔드 에이전트다.

## 목표
neoncat.jpg를 중앙 9:16 스테이지에 올린 다크모드 숏폼 플레이어를 만든다.
short.jpg는 UI 구조 레퍼런스, music.mp3는 오디오다.

## 테마 JSON (필수)
{
  "Primary": "#FF4FE2",
  "Secondary": "#5CE1FF",
  "Background": "#07080F",
  "Accent": "#C8FF6A"
}

CSS 변수: --color-primary/secondary/background/accent 및
--color-bg-elevated:#0F1A3A, --color-surface-overlay:rgba(7,8,15,.55),
--color-text-primary:#F5F7FF, --scrim-top/bottom.

## 레이아웃 절대좌표 (stage % 기준)
- Title: top 0, left 4.2%, right 56px, padding-top max(12px, safe-area, 4.5%), 높이 ≤12%
- Action rail: right 3.2%, top 48%, bottom 22%, gap 18px, icon 44px + dark circular plate
  Like@52% / Comment@62% / Share@72%
- Meta bar: left 3.5%, right 18%, bottom 0, padding-bottom max(10px, safe-area, 2.8%)
  profile ~86–90%, caption ~90–94%, music ~95–98%

## Safe Zone (오버레이 금지)
- Face/Eyes: y 18–42%, x 25–75%
- Content safe box padding 개념: top 14% / right 18% / bottom 28% / left 8%
- DJ Deck(y 72–95%) 위에는 불투명 바 금지, 반투명 스크림만

## 기술 제약
- 단일 페이지(또는 기존 스택에 맞는 React/HTML), 반응형, 터치 44px+
- object-fit:cover; object-position:center
- 모션 최소 2개(like bounce, music rotate)
- 카드형 히어로/퍼플 그라데이션 테마/이모지 장식 금지

SHORTFORM_PLAYER_SPEC.md의 섹션 2–7을 코드 구조의 소스로 삼아 구현을 시작하라.
```
