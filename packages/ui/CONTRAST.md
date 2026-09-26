# Matura UI — Token Usage & Contrast Law

Brand tokens (`src/styles/globals.css`): Midnight `#111827`, Liquid Mint `#42E8B4`,
Mist `#F4F7F6`, Deep Night `#080D17`. WCAG AA thresholds: **4.5:1** normal text,
**3:1** large text / non-text UI / focus indicators.

## The contrast law (computed ratios)

| Foreground / Background   | Ratio    | Verdict                            |
| ------------------------- | -------- | ---------------------------------- |
| Midnight / Mist           | 16.46    | PASS (body text on light)          |
| Mist / Deep Night         | 18.03    | PASS (body text on dark)           |
| Liquid Mint / Deep Night  | 12.44    | PASS (mint text/ring **on dark**)  |
| Midnight / Liquid Mint    | 11.35    | PASS (dark label **on** mint fill) |
| **Liquid Mint / Mist**    | **1.45** | **FAIL**                           |
| **Liquid Mint / white**   | **1.56** | **FAIL**                           |
| **Midnight / Deep Night** | **1.10** | **FAIL**                           |

## Rules that fall out

- **Liquid Mint is a _light_ accent.** Never use it as text, icon, link, or focus ring on
  Mist/white. On light pages the primary CTA is a **mint fill with a Midnight/Deep-Night
  label**; the focus ring (`--ring`) is **Midnight**.
- **On dark surfaces** (Deep Night sidebar / protocol proof / final CTA) mint IS legal as
  text, icon, hairline, and focus ring (`--ring` is mint under `.dark`).
- **Body text:** Midnight-on-Mist (light) and Mist-on-Deep-Night (dark). Never Midnight on
  Deep Night (1.10).
- **Mint is reserved for positive/action.** The testnet/synthetic/delayed signal uses
  `--warning` (amber), never mint. True failures (reverted/rejected) use `--destructive` (red).
- **Vault allocation segments** use the categorical ramp (`--color-vault-1..4`) — one tonal
  family, all dark-label-safe. Mint is not a vault fill. "You retain" uses `--color-retained`
  (neutral gray) and is always rendered hatched so it reads as non-identity.
- **Money / addresses / hashes** render in `--font-mono` (Geist Mono), `tabular-nums`,
  right-aligned in tables.
