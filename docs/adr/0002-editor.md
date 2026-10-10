# ADR 0002: TipTap core and one Yjs document per page

2026-10-10. Use open-source TipTap 3.31.4 / ProseMirror and Yjs 13.6.33.
Alternatives: BlockNote core; handwritten contenteditable. TipTap has a
composition-aware editor and a direct Yjs binding without paid extensions.

Spike: `/spikes/editor` binds actual ProseMirror content to Yjs, merges IndexedDB
snapshots transactionally and persists multilingual text. Tests cover synthetic
composition guards, slash commands, formatting, reload and offline editing.
Initial and additional editor JS each meet the 250 KiB gzip budget.

Separate dnd-kit rows do not prove rich-text block dragging. Native IME,
selection, long-press block drag and toolbar position above the iOS keyboard
remain device/Phase 1 gates. Go for implementation with those gates open.
Fallback: repeat the same spike with BlockNote core and verify its licenses.
