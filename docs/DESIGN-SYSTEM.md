# Workspace design system

The redesign uses `packages/ui/src/tokens.css` as its color, type, spacing and motion source. Urbanist Variable is bundled locally; Noto Sans Khmer Variable remains the Khmer fallback. Legacy storage/package names remain unchanged.

| Role | Light | Dark |
|---|---|---|
| Canvas | `#DFE1E0` | `#191919` |
| Surface | white | charcoal |
| Ink action | `#242221`, white text | light ink, dark text |
| Current/next marker | `#B6FF65`, `#001500` text | same |
| Schedule/dock | black, white text | same |

Use ink for primary actions, lime for current/next emphasis, semantic success/danger for status, and calendar color tokens for events. Keep literal CSS colors confined to tokens. `pnpm contrast` checks text, focus, calendar and brand pairs in both themes.

Radii follow roles: controls 14, groups 20, cards 28, sheets 32 and pills 999 px. Controls must provide 44×44 CSS px targets. Use existing Pressable, visible focus rings, reduced-motion support and the 4/8 px spacing scale. The reading pane remains narrow; tables/calendars fill their pane and scroll within intentional regions. Today is capped at 1480 px.

`Today.tsx` owns reusable ProjectCard, TaskCard and OptionPill. `ActionMenu.tsx` supplies menu semantics, arrow/Home/End/Escape handling, outside dismissal and focus return. Database view tabs support arrows/Home/End, retain imported view labels and expose the active panel. Desktop property/filter/sort controls anchor the existing Sheet; phones use the same focus-managed sheet.

The month calendar uses roving date focus: arrows move days, Page Up/Down move a month while clamping the day, Enter opens creation, and T returns to today. D/W/M/A select views outside fields and dialogs. All-day bars span each week once; overflow opens the complete day's events. Phone month selection keeps an agenda; desktop date-number selection opens Day.

Trash confirmation is an alertdialog with Cancel focused. Cloud deletion requires a matching online session and server acknowledgement. Read `adr/0010-permanent-deletion.md` before changing that contract.

The layout audit generates inspectable geometry receipts and screenshots. Screenshot evidence cannot approve visual baselines or replace physical keyboard, VoiceOver/Narrator, IME and safe-area acceptance.
