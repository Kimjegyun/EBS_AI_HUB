---
name: Professional Light System
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#464555'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#575e70'
  on-secondary: '#ffffff'
  secondary-container: '#d9dff5'
  on-secondary-container: '#5c6274'
  tertiary: '#7e3000'
  on-tertiary: '#ffffff'
  tertiary-container: '#a44100'
  on-tertiary-container: '#ffd2be'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#dce2f7'
  secondary-fixed-dim: '#c0c6db'
  on-secondary-fixed: '#141b2b'
  on-secondary-fixed-variant: '#404758'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb695'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7b2f00'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
typography:
  h1:
    fontFamily: Noto Sans KR
    fontSize: 40px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  h2:
    fontFamily: Noto Sans KR
    fontSize: 30px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  h3:
    fontFamily: Noto Sans KR
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Noto Sans KR
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: '0'
  body-md:
    fontFamily: Noto Sans KR
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: '0'
  label-sm:
    fontFamily: Noto Sans KR
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
---

## Brand & Style

This design system is built upon a **Modern Corporate** aesthetic, prioritizing clarity, efficiency, and professional trust. It transitions from a dark, tech-heavy atmosphere to a "Clean Light" mode that emphasizes readability and structured data presentation. The style is characterized by high-contrast typography, generous white space, and a refined use of the Indigo brand color to guide user action without overwhelming the visual field. The emotional response should be one of reliability and intellectual focus, suitable for high-utility AI workflows.

## Colors

The palette is anchored by a high-clarity neutral scale. The base background utilizes **Gray-50** to provide a soft canvas that reduces eye strain compared to pure white. Surfaces and panels are rendered in **White** to create a clear "layering" effect.

**Indigo-600 (#4F46E5)** remains the primary brand signal, used exclusively for primary actions, active states, and critical highlights. Borders leverage **Gray-200** for structural definition and **Indigo-50 (#EEF2FF)** for subtle decorative separation or muted container grouping.

## Typography

The system utilizes the **Noto Sans KR** font stack to ensure exceptional legibility across Korean and Latin characters. Text hierarchy is enforced through strict color application: **Gray-900** for all headings to provide a strong visual anchor, and **Gray-600** for body copy to maintain a comfortable reading rhythm. Small labels and metadata should utilize **Gray-500** to indicate secondary importance. High-contrast ratios are maintained throughout to meet accessibility standards and project a professional, editorial quality.

## Layout & Spacing

This design system employs a **12-column fluid grid** with a maximum container width for readability. The spacing rhythm is based on a **4px baseline**, ensuring mathematical consistency across all margins and paddings. 

- **Gutters:** Standardized at 24px (lg) for desktop to provide ample breathing room between content modules.
- **Margins:** Page margins are set to 32px (xl) for web views, scaling down to 16px (md) for mobile.
- **Sectioning:** Vertical spacing between major sections should utilize 64px (3xl) to maintain the clean, "airy" professional feel.

## Elevation & Depth

Depth is communicated through **tonal layering and subtle shadows** rather than heavy gradients. 

1.  **Base (Level 0):** Gray-50 (#F9FAFB).
2.  **Surface (Level 1):** White (#FFFFFF) with a `shadow-sm` (0 1px 2px 0 rgba(0, 0, 0, 0.05)). This is the primary card and panel style.
3.  **Raised (Level 2):** White (#FFFFFF) with a standard shadow (0 4px 6px -1px rgba(0, 0, 0, 0.1)). Reserved for hover states or dropdown menus.

Borders are used as the primary structural tool on the base layer, while shadows are reserved for white surfaces to prevent the UI from appearing "flat" or unorganized.

## Shapes

The shape language is **Rounded**, striking a balance between the clinical feel of sharp corners and the overly casual nature of pill shapes. 

- **Standard Radius:** 0.5rem (8px) for buttons, input fields, and small cards.
- **Large Radius:** 1rem (16px) for main content containers and modal windows.
- **Interactive Elements:** Maintain consistent 8px rounding to ensure a cohesive "clickability" language across the interface.

## Components

### Buttons
- **Primary:** Solid Indigo-600 background, White text. No shadow on rest, slight lift on hover.
- **Secondary:** White background, Gray-200 border, Gray-900 text.
- **Ghost:** No background or border, Indigo-600 text.

### Input Fields
- **Default:** White background, Gray-200 border, Gray-900 text.
- **Focus:** Indigo-600 border with a 2px Indigo-50 outer glow/ring.
- **Placeholder:** Gray-400.

### Badges / Chips
- **Neutral:** Gray-100 background, Gray-700 text, no border.
- **Brand:** Indigo-50 background, Indigo-600 text.

### Cards
- **Container:** White background, Gray-200 border, `shadow-sm`.
- **Header:** Subtle Gray-50 bottom border to separate title from content.

### Lists
- **Item:** 1px border-bottom using Gray-100; hover state uses Gray-50 background to indicate interactivity.