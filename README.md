# Further Compare

**Further Compare** is a modern enterprise-grade web application for robust file/text comparison and interactive merging, built to handle code, documents, and structured data with architectural transparency and a premium user experience.

---

## Features

- **Side-by-side compare**: Visualize two files or text blocks (“Source Version” and “Target Version”) in a maximized, professional workspace.
- **Enterprise menu bars**: Above each editor, professional controls for file upload, clear, and copy all from the other side; compact, premium design.
- **Contenteditable diff editors**: Highly interactive, with line numbers, placeholders, persistent margin, and easy navigation.
- **Inline difference highlighting**: Insertions (green), deletions (red), unchanged (grey). Line-level granularity.
- **Per-line and bulk copy**: Click icon-only buttons to copy all or specific lines from one side to the other, with logic handling all edit/copy permutations.
- **Whitespace/tabs ignore**: Optionally ignore minor differences for clean reviews.
- **Full responsiveness and modern palette**: Fluid layout, premium color use, and spacing for aesthetic and ease of use.

---

## Architecture and Logic

### 1. Source State Management

- **Source buffers** (`sourceA`, `sourceB`) always hold the canonical, plain-text content of each editor. All merge, copy, and diff logic is based on these, **never taking content directly from rendered diff HTML**.
- **On edit (input/paste):**
  - Editor contents are sanitized: all HTML is stripped to plain text, then line breaks are restored (`.innerHTML = ""` and then split/append text nodes).
  - The corresponding source value is updated before any diff render.
- This **prevents artifacts** (e.g., line numbers, icons, diff HTML) from entering user-edited file content.

### 2. Diff Rendering

- Every change or operation triggers `renderDiff()`.
  - Both buffer contents are trimmed, cleaned, and sent to a custom `diffLines()` function.
  - `diffLines()` performs a line-by-line, index-aware diff, marking insertions, deletions, and unchanged lines.
  - The diff is rendered into `.diff-edit` as full HTML (with line numbers, copy icons, and correct classes).

### 3. Placeholders & Spacing

- Placeholders (“Source Version”, “Target Version”) use the contenteditable `:empty:before` trick, with dedicated min-height and absolute positioning for premium clarity.
- Margin between editors (`gap: 28px`) and top/bottom padding create an appealing professional layout.

### 4. Per-Line Copy Button Logic

- **Logic for every diff line:**
  - Each “copy this line” button is rendered with:
    - `data-line-idx-source`: the canonical line index in the source buffer.
    - `data-line-idx`: the *visual* diff row index.
  - On click:
    - The actual line string from the *true source buffer* at source index is extracted.
    - The insertion point in the target buffer is determined: at the diff visual index (`visIdx`). If out of range, appends to end.
    - The line is inserted; **never overwrites an unrelated line**. This avoids space removal and data loss, robustly handling divergent files.
  - All click handlers are re-bound on every diff render, ensuring dynamic elements always have live handlers.

### 5. Bulk Copy & Clear

- **Bulk copy**: Merges any missing lines from one side’s buffer into the other at the end, never overwriting, always safe (can manually delete if needed).
- **Clear**: Sets the corresponding source buffer to an empty string; the diff is rendered empty, activating the placeholder.

---

## Best Practices and Design Rationale

- **Data integrity**: Edits and merges never risk overwriting or losing unrelated lines. Every merge is an explicit action.
- **Separation of Display vs. Data**: All reads, diffs, and copies are from the canonical buffer, never the rendered HTML.
- **Accessibility**: Icon-only actions have `title`/aria labels; tab order is preserved; high color contrast is maintained.
- **Developer Transparency**: Logging statements exist for debugging per-line copy, making debugging safe for scaling and team handoff.

---

## Troubleshooting

- **If artifacts persist** after editing, ensure cleanse logic runs on every input/paste.
- **If copy-line fails**, see the Console for logs detailing the event, index, and text.
- For further enhancements, consider integrating a LCS (Longest Common Subsequence) diff for more granular diffs, or allow user-configurable merge strategies.

---

## Credits

“Further Compare” is designed for premium enterprise text and file review.  
Copyright 2026 Further Compare.