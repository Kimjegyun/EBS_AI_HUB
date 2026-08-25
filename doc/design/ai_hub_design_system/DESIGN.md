---
name: AI HUB Design System
colors:
  surface: '#13121b'
  surface-dim: '#13121b'
  surface-bright: '#393842'
  surface-container-lowest: '#0e0d16'
  surface-container-low: '#1b1b24'
  surface-container: '#1f1f28'
  surface-container-high: '#2a2933'
  surface-container-highest: '#35343e'
  on-surface: '#e4e1ee'
  on-surface-variant: '#c7c4d8'
  inverse-surface: '#e4e1ee'
  inverse-on-surface: '#302f39'
  outline: '#918fa1'
  outline-variant: '#464555'
  surface-tint: '#c3c0ff'
  primary: '#c3c0ff'
  on-primary: '#1d00a5'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#4d44e3'
  secondary: '#89ceff'
  on-secondary: '#00344d'
  secondary-container: '#00a2e6'
  on-secondary-container: '#00344e'
  tertiary: '#ffb695'
  on-tertiary: '#571f00'
  tertiary-container: '#a44100'
  on-tertiary-container: '#ffd2be'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#c9e6ff'
  secondary-fixed-dim: '#89ceff'
  on-secondary-fixed: '#001e2f'
  on-secondary-fixed-variant: '#004c6e'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb695'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7b2f00'
  background: '#13121b'
  on-background: '#e4e1ee'
  surface-variant: '#35343e'
  primary-light: '#6366F1'
  primary-dark: '#3730A3'
  success: '#10B981'
  warning: '#F59E0B'
  danger: '#EF4444'
  info: '#3B82F6'
  bg-base-dark: '#0F1117'
  bg-surface-dark: '#1A1D27'
  bg-elevated-dark: '#22263A'
  bg-overlay-dark: '#2D3148'
  border-dark: '#2E3250'
  bg-base-light: '#F8F9FC'
  bg-surface-light: '#FFFFFF'
  bg-overlay-light: '#F1F3F9'
  border-light: '#E2E8F0'
typography:
  display:
    fontFamily: Noto Sans KR
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  h1:
    fontFamily: Noto Sans KR
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.3'
  h2:
    fontFamily: Noto Sans KR
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.35'
  h3:
    fontFamily: Noto Sans KR
    fontSize: 16px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.6'
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.5'
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.4'
  label:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: '1.3'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 20px
  '6': 24px
  '8': 32px
  '12': 48px
  '16': 64px
  gutter: 16px
  sidebar-expanded: 240px
  sidebar-collapsed: 64px
  topbar-height: 60px
---

# DESIGN.md — AI HUB Design System

> Google Stitch DESIGN.md format
> Import this file into Stitch to apply the AI HUB design system.

---

## Product Overview

**Product Name:** AI HUB  
**Type:** Enterprise SaaS Dashboard (internal tool)  
**Platform:** Web (Desktop primary, Tablet secondary)  
**Users:** Company employees — Admin and general User roles  
**Core Concept:** A modular, plugin-based AI productivity hub with a sidebar navigation and a drag-and-drop widget dashboard.

---

## Design Principles

1. **Clarity over cleverness** — Every element must serve a clear purpose
2. **Modular consistency** — Plugins and core UI share the same component language
3. **Information density** — Dashboard shows maximum useful info without clutter
4. **Role-aware UI** — Admin users see management controls; regular users see clean workspaces
5. **Dark mode first** — Built for long working sessions

---

## Color System

### Brand Colors
```
Primary:       #4F46E5  (Indigo-600)   — main actions, active states, brand
Primary Light: #6366F1  (Indigo-500)   — hover states
Primary Dark:  #3730A3  (Indigo-700)   — pressed states
Accent:        #0EA5E9  (Sky-500)      — highlights, links, secondary actions
```

### Semantic Colors
```
Success:  #10B981  (Emerald-500)
Warning:  #F59E0B  (Amber-500)
Danger:   #EF4444  (Red-500)
Info:     #3B82F6  (Blue-500)
```

### Neutral Palette
```
Gray-50:  #F9FAFB
Gray-100: #F3F4F6
Gray-200: #E5E7EB
Gray-300: #D1D5DB
Gray-400: #9CA3AF
Gray-500: #6B7280
Gray-600: #4B5563
Gray-700: #374151
Gray-800: #1F2937
Gray-900: #111827
```

### Dark Mode Backgrounds
```
bg-base:     #0F1117  — page background
bg-surface:  #1A1D27  — cards, panels
bg-elevated: #22263A  — dropdowns, modals
bg-overlay:  #2D3148  — hover states
border:      #2E3250  — default borders
border-muted:#1E2140  — subtle dividers
```

### Light Mode Backgrounds
```
bg-base:     #F8F9FC
bg-surface:  #FFFFFF
bg-elevated: #FFFFFF
bg-overlay:  #F1F3F9
border:      #E2E8F0
border-muted:#EEF2FF
```

---

## Typography

### Font Stack
```
Primary (UI):    "Noto Sans KR", "Inter", sans-serif
Monospace:       "JetBrains Mono", "Fira Code", monospace
```

### Type Scale
```
Display:    32px / font-weight: 700 / line-height: 1.2
H1:         24px / font-weight: 700 / line-height: 1.3
H2:         20px / font-weight: 600 / line-height: 1.35
H3:         16px / font-weight: 600 / line-height: 1.4
H4:         14px / font-weight: 600 / line-height: 1.4
Body-LG:    16px / font-weight: 400 / line-height: 1.6
Body:       14px / font-weight: 400 / line-height: 1.6
Body-SM:    13px / font-weight: 400 / line-height: 1.5
Caption:    12px / font-weight: 400 / line-height: 1.4
Label:      11px / font-weight: 500 / line-height: 1.3 / letter-spacing: 0.05em / UPPERCASE
```

---

## Spacing

```
spacing-1:   4px
spacing-2:   8px
spacing-3:   12px
spacing-4:   16px
spacing-5:   20px
spacing-6:   24px
spacing-8:   32px
spacing-10:  40px
spacing-12:  48px
spacing-16:  64px
```

---

## Border Radius

```
radius-sm:   4px   — badges, chips, small tags
radius-md:   8px   — buttons, inputs, small cards
radius-lg:   12px  — cards, panels
radius-xl:   16px  — modals, large containers
radius-2xl:  20px  — floating panels
radius-full: 9999px — avatars, pills, toggles
```

---

## Shadows

```
shadow-sm:  0 1px 2px rgba(0,0,0,0.08)
shadow-md:  0 4px 12px rgba(0,0,0,0.12)
shadow-lg:  0 8px 24px rgba(0,0,0,0.16)
shadow-xl:  0 16px 40px rgba(0,0,0,0.20)
shadow-glow: 0 0 0 3px rgba(79,70,229,0.25)  — focus ring
```

---

## Layout Structure

### Overall Layout
```
┌─────────────────────────────────────────────┐
│  TOP BAR (60px)                              │
│  Logo | Search | Notifications | Avatar      │
├──────────┬──────────────────────────────────┤
│ SIDEBAR  │  MAIN CONTENT AREA               │
│ (240px   │  (flex-grow)                     │
│  collapsed│                                 │
│  = 64px) │                                  │
│          │                                  │
│  Nav     │  Page content / Dashboard Grid   │
│  Modules │                                  │
│  User    │                                  │
└──────────┴──────────────────────────────────┘
```

### Sidebar
- Width: 240px (expanded) / 64px (collapsed)
- Background: bg-surface (dark) / White (light)
- Contains: App logo, navigation items, installed module list, user profile
- Active item: Primary color left border (3px) + primary bg tint
- Hover: bg-overlay
- Icons: 20px, Lucide icon set
- Label: 14px, font-weight 500

### Top Bar
- Height: 60px
- Background: bg-surface with bottom border
- Contains: Hamburger (mobile), Global search (⌘K), Notification bell + badge, User avatar + dropdown

### Dashboard Grid
- Column system: 12 columns
- Gutter: 16px
- Widget cards: draggable, resizable
- Min widget size: 2 cols × 2 rows
- Widget card: bg-surface, radius-lg, shadow-sm, 20px padding

---

## Components

### Button
```
Variants: primary | secondary | ghost | danger | success
Sizes:    sm (32px) | md (36px) | lg (44px)
States:   default | hover | active | disabled | loading

Primary:
  Background: #4F46E5
  Text:       #FFFFFF
  Hover:      #4338CA
  Active:     #3730A3
  Border-radius: 8px
  Padding:    8px 16px (md)
  Font-weight: 500

Secondary:
  Background: transparent
  Border:     1px solid #4F46E5
  Text:       #4F46E5
  Hover bg:   rgba(79,70,229,0.08)

Ghost:
  Background: transparent
  Text:       Gray-600
  Hover bg:   Gray-100 (light) / bg-overlay (dark)

Danger:
  Background: #EF4444
  Text:       #FFFFFF
```

### Input / Form Field
```
Height:       40px
Border:       1px solid border-color
Border-radius: 8px
Background:   bg-surface
Padding:      10px 12px
Font-size:    14px

States:
  Default:  border = Gray-300 (light) / #2E3250 (dark)
  Focus:    border = #4F46E5, box-shadow = shadow-glow
  Error:    border = #EF4444
  Disabled: opacity 0.5

Label: 13px, font-weight 500, margin-bottom 6px
Helper text: 12px, Gray-500, margin-top 4px
Error text: 12px, #EF4444, margin-top 4px
```

### Card
```
Background:    bg-surface
Border:        1px solid border-color
Border-radius: radius-lg (12px)
Padding:       20px 24px
Shadow:        shadow-sm

Card Header:
  Title:     H3 (16px, 600)
  Subtitle:  Caption (12px, Gray-500)
  Actions:   right-aligned icon buttons

Card with status bar:
  Top border: 3px solid [status-color]
```

### Badge / Tag
```
Padding:       3px 8px
Border-radius: radius-sm (4px) or radius-full (pill)
Font-size:     11px
Font-weight:   500

Status variants:
  active:   bg #DCFCE7, text #166534
  inactive: bg #F3F4F6, text #6B7280
  pending:  bg #FEF3C7, text #92400E
  error:    bg #FEE2E2, text #991B1B
  admin:    bg #EDE9FE, text #5B21B6
  new:      bg #DBEAFE, text #1E40AF
```

### Avatar
```
Sizes: xs(24px) | sm(32px) | md(40px) | lg(48px) | xl(64px)
Shape: circle (border-radius: full)
Fallback: initials on Primary color bg
Border: 2px solid bg-surface (for stacked avatars)
```

### Modal / Dialog
```
Overlay:       rgba(0,0,0,0.6) backdrop
Container:     bg-elevated, radius-xl, shadow-xl
Max-width:     480px (sm) | 640px (md) | 800px (lg)
Padding:       24px
Header:        H2 + close button (X icon, top-right)
Footer:        right-aligned button group (Cancel + Confirm)
Animation:     fade-in + scale from 0.95 to 1.0
```

### Toast / Notification
```
Position:      bottom-right (desktop)
Width:         360px max
Border-radius: radius-lg
Padding:       14px 16px
Shadow:        shadow-lg
Auto-dismiss:  4 seconds

Variants:
  success: left border 4px #10B981 + check icon
  error:   left border 4px #EF4444 + X icon
  warning: left border 4px #F59E0B + warning icon
  info:    left border 4px #3B82F6 + info icon
```

### Toggle / Switch
```
Width: 44px / Height: 24px
Knob: 18px circle, bg-white, 3px inset
Off:  bg Gray-300
On:   bg Primary (#4F46E5)
Transition: 200ms ease
```

### Dropdown / Select
```
Trigger:  same as Input component
Menu:     bg-elevated, radius-lg, shadow-lg, 4px above input
Item:     40px height, 12px 16px padding, hover = bg-overlay
Selected: Primary color text + checkmark icon right
Separator: 1px border-muted
```

### Progress Bar
```
Height:        6px
Border-radius: radius-full
Background:    bg-overlay
Fill:          Primary gradient (#4F46E5 → #6366F1)
Animated:      shimmer when loading
```

### Sidebar Navigation Item
```
Height:        44px
Padding:       0 16px
Border-radius: 8px (inside sidebar)
Icon:          20px, margin-right 12px
Label:         14px, font-weight 500
Active state:
  Background:  rgba(79,70,229,0.12)
  Left border: 3px solid #4F46E5
  Text/icon:   #4F46E5
Hover state:
  Background:  bg-overlay
```

### Plugin / Module Card (Marketplace)
```
Size:    Card component base
Layout:  Icon (48px, radius-lg) | Title + Category badge | Description | Install button + stats
Footer:  Install count + Version + Author
States:
  Not installed: Secondary button "설치"
  Installing:    Disabled button with spinner "설치 중..."
  Installed:     Ghost button "제거" + Active badge
  Update available: Warning badge + "업데이트" button
```

### Dashboard Widget Card
```
Base: Card component
Header: Module icon (20px) + Module name + drag handle (⠿) + settings (⚙)
Content: Module-provided widget content
Footer (optional): Last updated timestamp + action link
Resize handle: bottom-right corner
States:
  Loading:  skeleton shimmer
  Error:    red border + error message + retry button
  Empty:    centered empty state illustration + CTA
```

---

## Iconography

```
Library:   Lucide Icons (outline style)
Sizes:     16px (inline) | 20px (navigation, actions) | 24px (headers)
Color:     inherit from parent text color
Stroke:    1.5px
```

### Key Icons Used
```
dashboard      → LayoutDashboard
plugins        → Puzzle
calendar       → Calendar
mail           → Mail
tasks          → CheckSquare
settings       → Settings
admin users    → Shield
notifications  → Bell
search         → Search
module install → Download
module remove  → Trash2
active         → CheckCircle
inactive       → Circle
error          → AlertCircle
update         → RefreshCw
drag handle    → GripVertical
```

---

## Screen Inventory

### 1. Login Page
- Centered card layout (480px max-width)
- Company logo top center
- Email + Password fields
- "로그인" primary button (full width)
- "Google로 로그인" OAuth button
- Link: "비밀번호 찾기"
- Below card: "계정이 없으신가요? 관리자에게 문의하세요"
- Background: subtle indigo gradient or pattern

### 2. Pending Approval Page
- Simple centered state
- Clock/hourglass illustration
- Title: "승인 대기 중"
- Description: "관리자가 계정을 승인하면 이용 가능합니다"
- Contact admin CTA button

### 3. Main Dashboard
- Full layout with sidebar + topbar
- Hero area: Greeting + date
- Widget grid (12-col, drag-and-drop)
- Default widgets: Calendar mini, Tasks, Mail preview, Quick actions
- Empty state: "플러그인을 설치하여 대시보드를 꾸며보세요" + Install button

### 4. Module Marketplace
- Page title + search bar + category filter tabs
- Card grid (3 columns desktop, 2 tablet)
- Tabs: 전체 | 설치됨 | 코어 | 생산성 | 운영 | 미디어 | 분석
- Each card: Module card component
- Install confirmation modal

### 5. Module Detail Page
- Banner / hero with module icon + name
- Tabs: 개요 | 설치 방법 | 변경 이력 | 권한
- Permission list with icons
- Screenshots/preview area
- Sidebar: Install button + stats (사용자 수, 버전, 제작자)

### 6. Admin — User Management
- Page title + "신규 사용자 초대" button
- Stats cards row: 전체 사용자 | 활성 | 대기 중 | 관리자
- Filter tabs + search
- User table: Avatar | 이름/이메일 | 부서 | 역할 badge | 상태 badge | 가입일 | 액션(승인/거절/역할변경)
- Pending approval section highlighted at top

### 7. Admin — Module Management
- Registered modules table
- Tabs: 등록된 모듈 | 승인 대기 | 버전 관리
- Upload new module button (zip/aihub file)
- Per-module: Approve/Reject toggle, Force uninstall, Version history

### 8. Settings Page
- Two-column layout: settings nav (left) | content (right)
- Sections: 프로필 | 알림 | 테마 | 언어 | 연동 계정 (Google/Outlook OAuth)
- Theme toggle: Light / Dark / System

### 9. Individual Module View (full page)
- Uses sidebar slot / replaces main content
- Module provides its own UI via getComponent()
- Common wrapper: Breadcrumb (대시보드 > 모듈명) + module content

---

## Interaction Patterns

### Module Install Flow
1. User clicks "설치" on marketplace card
2. Confirmation modal: shows required permissions list
3. User confirms → button becomes "설치 중..." with spinner
4. Success toast: "✅ [모듈명] 설치 완료"
5. Card status updates to installed
6. Option to "지금 활성화하기"

### Module Remove Flow
1. User clicks "제거" (ghost button)
2. Danger modal: "정말 제거하시겠습니까?"
3. Checkbox option: "관련 데이터도 삭제" (unchecked by default)
4. Confirm → processing state → success toast

### Admin User Approval
1. Admin sees pending users section at top of user management
2. "승인" / "거절" buttons inline on table row
3. Quick confirm tooltip (not full modal for speed)
4. Status badge updates in real-time

### Dashboard Widget Add
1. "+ 위젯 추가" button top-right of dashboard
2. Slide-out panel (from right): list of installed modules with widgets
3. Click module → widget drops into first available grid slot
4. Drag to reposition, drag corner to resize

---

## Animation & Motion

```
Duration:
  instant:  0ms    — state changes (toggle on/off)
  fast:     100ms  — tooltips, badge updates
  normal:   200ms  — most transitions
  slow:     300ms  — modals, page transitions
  xslow:    500ms  — loading states, skeleton shimmer

Easing:
  default:  cubic-bezier(0.4, 0, 0.2, 1)   — material standard
  enter:    cubic-bezier(0.0, 0, 0.2, 1)   — decelerate
  leave:    cubic-bezier(0.4, 0, 1, 1)     — accelerate
  spring:   cubic-bezier(0.34, 1.56, 0.64, 1) — bouncy (widget drop)

Key animations:
  - Modal: fade(0→1) + scale(0.95→1.0), 200ms enter
  - Toast: slide-in from right, 200ms
  - Widget drop: spring scale 0.95→1.0
  - Sidebar collapse: width transition, 200ms
  - Page transition: fade 150ms
  - Skeleton: shimmer (gradient sweep) 1.5s loop
```

---

## Empty States

```
Structure: Illustration (120px) | Title (H3) | Description (Body-SM) | CTA button

Dashboard (no widgets):
  Illustration: grid with + icon
  Title: "대시보드를 꾸며보세요"
  CTA: "플러그인 설치하기"

Marketplace (no results):
  Illustration: search icon
  Title: "검색 결과가 없습니다"
  Description: "다른 키워드로 검색해 보세요"

Notifications (none):
  Illustration: bell with checkmark
  Title: "새 알림이 없습니다"
  
Module error:
  Illustration: broken puzzle piece
  Title: "모듈을 불러올 수 없습니다"
  CTA: "재시도" + "모듈 재설치"
```

---

## Responsive Breakpoints

```
mobile:  < 768px   — sidebar hidden (drawer), single column
tablet:  768–1279px — sidebar collapsed (icons only), 2-col grid
desktop: ≥ 1280px  — sidebar expanded, 12-col grid
wide:    ≥ 1536px  — max-width 1440px centered
```

---

## Accessibility

```
- Minimum contrast ratio: 4.5:1 (WCAG AA)
- Focus ring: 3px solid #4F46E5, 2px offset
- All interactive elements: keyboard navigable
- Icon buttons: aria-label required
- Form fields: label association (htmlFor / aria-labelledby)
- Status badges: role="status" for screen readers
- Modal: focus trap + Escape to close
- Loading states: aria-busy="true"
- Error messages: aria-live="polite"
```

---

## Design Tokens (CSS Variables)

```css
:root {
  --color-primary:        #4F46E5;
  --color-primary-hover:  #4338CA;
  --color-accent:         #0EA5E9;

  --color-success:        #10B981;
  --color-warning:        #F59E0B;
  --color-danger:         #EF4444;
  --color-info:           #3B82F6;

  --font-sans:    "Noto Sans KR", "Inter", sans-serif;
  --font-mono:    "JetBrains Mono", monospace;

  --radius-sm:    4px;
  --radius-md:    8px;
  --radius-lg:    12px;
  --radius-xl:    16px;
  --radius-full:  9999px;

  --shadow-sm:    0 1px 2px rgba(0,0,0,0.08);
  --shadow-md:    0 4px 12px rgba(0,0,0,0.12);
  --shadow-lg:    0 8px 24px rgba(0,0,0,0.16);
  --shadow-glow:  0 0 0 3px rgba(79,70,229,0.25);

  --transition-fast:   100ms cubic-bezier(0.4,0,0.2,1);
  --transition-normal: 200ms cubic-bezier(0.4,0,0.2,1);
  --transition-slow:   300ms cubic-bezier(0.4,0,0.2,1);
}
```
