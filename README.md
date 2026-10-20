# Pointer Notes

A Chrome extension (Manifest V3) for leaving visual feedback on any web page and copying it as structured markdown for AI coding agents.

Click an element, drag an area, or select text, write a note, then hit **Copy**. The output includes CSS selectors, DOM paths, React/Vue component chains (with source locations when available), computed styles and your feedback, so an agent can find the right code quickly.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose this folder.
4. Open any `http(s)` page and click the toolbar icon, or press `Alt+Shift+A`.

After editing the code, click the reload icon on the extension card and refresh the page.

## Usage

| Mode | Key | What it does |
| --- | --- | --- |
| Element | `V` | Hover to highlight, click to annotate. Hold `Shift` and click to multi-select; release `Shift` to write one note for the group. |
| Text | `T` | Select text with the mouse; the note includes the quoted text. |
| Area | `A` | Drag a box. The note covers the region and every element fully inside it (an empty region is fine). |

Other controls:

- **H** shows or hides the markers, **C** copies the markdown, **P** pauses or resumes CSS and Web Animations so you can annotate a specific frame (JS-driven animation, canvas and video are not affected). These shortcuts are off while a note is open.
- **↑ / ↓** (element mode): step to the parent or child of the highlighted element. Also works inside an open note while it is still empty.
- **Drag** the grab bar at the top of a note to move it.
- **Cmd/Ctrl+Enter** saves a note; **Esc** cancels a drag, a pending selection or an open note, then closes the tool.
- Toolbar: **Copy**, **Markers** (show/hide), **Clear**, **✕** (close).
- Notes are stored per page (origin + path) in `chrome.storage.local`.

## Output example

```markdown
## Page Feedback: Dashboard
**URL:** http://localhost:3000/
**Viewport:** 1440×900

### 1. button "Buy"
**Selector:** `section.grid > div.card:nth-of-type(1) > button.buy`
**Path:** body > section > div > button
**Components:** App > Pricing > BuyButton
**Source:** src/components/BuyButton.tsx:12
**Styles:** color: …; background-color: …
**Feedback:** Make this the primary style
```

## Project layout

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension manifest. Permissions: `activeTab`, `scripting`, `storage`. |
| `background.js` | Injects the page scripts when the toolbar icon is clicked. |
| `content.js` | The overlay: modes, markers, note editor, markdown output (isolated world). |
| `main.js` | Reads React/Vue internals from the page's main world and hands them to `content.js`. |
| `icons/` | Toolbar and store icons. |

## Limitations

- Does not run on `chrome://` pages or the Chrome Web Store.
- React source locations (`Source:`) rely on dev builds exposing `_debugSource`; production builds usually only give component names.
- Text output only; no screenshots yet.
# pointer-notes
