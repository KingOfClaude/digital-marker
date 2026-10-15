# Digital Highlighter

A small Chrome extension for highlighting text on any web page, keeping it across visits, and browsing everything you've saved in one place.

Highlights are stored locally in your browser. Nothing is sent anywhere.

## Features

- **Highlight any text** on a page with a keyboard shortcut or the right-click menu.
- **Highlights persist.** Revisit the page and your highlights are re-applied.
- **Manager tab** with every highlight you've saved, grouped by page:
  - filter by site
  - search the text, page titles and sites
  - sort newest or oldest first
  - **Copy** a highlight
  - **Show on page** opens the page and scrolls to the highlight
  - **Delete**, with a few seconds to undo
  - **Export Markdown** of whatever is currently listed
- Light and dark mode, following your system setting.

## Install

The extension isn't on the Chrome Web Store, so you load it as an unpacked extension.

1. Unzip `digital-highlighter.zip`.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `digital-highlighter` folder.

If you're updating from an older version, remove the old copy first, or click the reload icon on its card. Chrome keeps each loaded extension's saved highlights separate, so a freshly loaded copy starts empty.

Tip: pin the extension from the puzzle-piece menu so the toolbar icon is always visible.

## Using it

### Highlighting

1. Select some text on a page.
2. Press **Alt+Shift+H**, or right-click and choose **Highlight selection**.

The text turns yellow and is saved. A short message at the bottom of the page confirms it. Selections can span several paragraphs.

To remove a highlight, click it and choose **Remove highlight**.

### The manager

Click the toolbar icon to open the manager in a tab. If it's already open, you're taken to it.

Press `/` in the manager to jump to the search box.

Deleting in the manager also removes the highlight from any open tab showing that page.

### Changing the shortcut

Go to `chrome://extensions/shortcuts` and set a shortcut for **Highlight the selected text**. If another extension or app already uses Alt+Shift+H, Chrome leaves the shortcut unassigned, so set a different one there. The right-click menu always works.

## Troubleshooting

| Problem | What to try |
| --- | --- |
| Nothing happens when I highlight | Make sure text is actually selected. Try the right-click menu instead of the shortcut. Check `chrome://extensions/shortcuts`. |
| A red `!` appears on the toolbar icon | The page is one Chrome doesn't allow extensions on (for example `chrome://` pages or the Chrome Web Store). |
| "Can't highlight that selection" | The selection is inside something that can't hold highlights, such as a text box, or it contains no text. |
| A highlight didn't come back after reloading the page | The page changed its text since you highlighted it. The saved text is still in the manager. |
| Manager shows nothing | Highlights are per Chrome profile and per installed copy of the extension. Check you're in the same profile. |

## Limitations

- **Web pages only:** it runs on `http://` and `https://` pages. It doesn't work on Chrome's built-in PDF viewer, `chrome://` pages, or the Chrome Web Store.
- **Top frame only:** text inside embedded iframes can't be highlighted.
- **Single-page apps:** pages that change content without reloading may not show your highlights again until you refresh.
- **Page changes:** if a site rewrites its text, an old highlight may fail to re-attach.
- **Per-URL:** highlights belong to a page's address without the `#fragment`. The same article at a different URL counts as a different page.
- **No sync:** highlights live in `chrome.storage.local` on this browser only. Use Export Markdown to back them up.
- **One color:** highlights are all the same yellow.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Save your highlights in the browser. |
| `contextMenus` | The "Highlight selection" right-click item. |
| `activeTab`, `scripting` | If you highlight in a tab that was already open before the extension was installed, it sets itself up in that tab instead of requiring a refresh. |
| Content script on `http://*/*` and `https://*/*` | Applies and re-applies highlights on pages. |

## How it works

- **Saving:** a highlight stores the selected text, the page URL and title, about 40 characters of text before and after it, and a timestamp.
- **Restoring:** when a page loads, the content script searches the page text for each saved highlight, using the surrounding text to pick the right occurrence, and wraps it in a `<mark>`. It retries after about 1.5 and 5 seconds for pages that load content late.
- **Storage format:** everything is kept in `chrome.storage.local` under one key, `highlights`, as an object of records keyed by ID:

```json
{
  "id": "mv8uwl7soquobe8e",
  "url": "https://example.com/essays/slow-reading",
  "title": "On slow reading",
  "text": "Attention is a muscle that only grows under load.",
  "prefix": "to let a sentence finish what it started in your head. ",
  "suffix": " The next paragraph begins here and runs on for a while.",
  "createdAt": 1760000000000
}
```

## Files

```
manifest.json     Extension manifest (Manifest V3)
LICENSE           CC0 1.0 public domain dedication
background.js     Shortcut, right-click menu, toolbar click
content.js        Creating, restoring and removing highlights on pages
content.css       Highlight and popover styling on pages
manager.html      Manager tab
manager.css       Manager styling
manager.js        Manager logic (list, search, filter, export)
icons/            Toolbar and extension icons
```

## Development

There's no build step. Edit the files, then click the reload icon on the extension's card at `chrome://extensions`. Refresh any open pages to pick up changes to `content.js` or `content.css`.

## License

Digital Highlighter is released under the [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) public domain dedication.

To the extent possible under law, all copyright and related rights in this work are waived. You can copy, modify, distribute and use it, including for commercial purposes, without asking permission and without giving credit.
