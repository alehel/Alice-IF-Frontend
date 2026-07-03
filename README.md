# The Alice Tales — a web front-end for the Alice interactive fictions

A static website for playing [Alice's Adventures in Wonderland
(IF)](https://github.com/alehel/Alice-In-Wonderland-IF) — and, once it is
written, *Through the Looking-Glass* — in the browser, dressed after the
original Macmillan editions with Sir John Tenniel's engravings.

## Running it

It is a plain static site; any web server will do:

```
python3 -m http.server 8080
# then open http://localhost:8080/
```

(It must be served over HTTP — the story file is fetched at runtime, so
opening `index.html` straight from the filesystem will not work.)

Deploying is copying the directory to any static host (GitHub Pages,
Netlify, nginx…). No build step, no server-side code.

## How it works

| Piece | Role |
|---|---|
| `stories/alice.z8` | the game, compiled Z-machine v8 (from the [game repo](https://github.com/alehel/Alice-In-Wonderland-IF)) |
| `assets/vendor/zvm.min.js` | [ifvms.js](https://github.com/curiousdannii/ifvms.js) 1.1.6 — the Z-machine engine (MIT) |
| `assets/vendor/glkote.js`, `glkapi.js` | [GlkOte/GlkApi](https://eblong.com/zarf/glk/glkote.html) 2.3.7 — display layer and Glk API (MIT) |
| `assets/vendor/jquery-1.12.4.min.js` | required by GlkOte (MIT) |
| `assets/js/alice-dialog.js` | **the site's custom file dialog** (see below) |
| `assets/js/alice-play.js` | boot code and page glue |
| `wonderland/` | the play page |
| `looking-glass/` | teaser page for the second book |

### Saving and restoring

`alice-dialog.js` replaces GlkOte's stock browser-storage file manager:

- **SAVE** (typed in-game, or the toolbar button): the Quetzal save file is
  downloaded directly into the player's Downloads folder, named e.g.
  `alice-in-wonderland-2026-07-03-142513.sav`. No dialogs, no browser storage —
  the file is the player's to keep.
- **RESTORE**: a native file picker opens; the player hands a previously
  downloaded `.sav` back. Saves are portable across browsers and machines.
- **SCRIPT** (transcripts) and command recordings are kept in memory while
  they grow — Glk flushes open files every few seconds, and downloading each
  flush would rain files on the player — and offered as a single download via
  a *Transcript* button that appears in the toolbar.
- Game-created data files are persisted quietly in `localStorage`.

## Illustrations & fonts

- Engravings by **Sir John Tenniel** (1865/1871, public domain), from the
  vectorised restorations by [Standard Ebooks](https://standardebooks.org)
  ([Wonderland](https://github.com/standardebooks/lewis-carroll_alices-adventures-in-wonderland),
  [Looking-Glass](https://github.com/standardebooks/lewis-carroll_through-the-looking-glass)),
  rasterised to WebP for the web.
- Type: [EB Garamond](https://fonts.google.com/specimen/EB+Garamond) and
  [Playfair Display](https://fonts.google.com/specimen/Playfair+Display)
  (SIL Open Font License), self-hosted as variable WOFF2.

## Adding Through the Looking-Glass later

When the second game is compiled:

1. Drop its story file at `stories/looking-glass.z8`.
2. Copy `wonderland/index.html` to a new `looking-glass/play.html` (or
   replace the teaser), point the `story` option at the new file and set
   `save_basename: 'through-the-looking-glass'`.
3. Swap the library page's *Still being written* ribbon for a *Begin* button.
