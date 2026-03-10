# TODO

## Curator API (via Blacksmith)

- [ ] **Blacksmith:** Implement module API registration so optional modules (Curator, Scribe, etc.) can register an API object and have it exposed as `BlacksmithAPI.curator`, etc. Same timing as hooks/menubar. See spec in chat (requirements for Blacksmith developer).
- [ ] **Curator:** Implement and expose API; register with Blacksmith when mechanism exists:
  - `updateTokenImages()` – update all token images on current canvas
  - `updatePortraitImages()` – update all portrait images on current canvas
  - `updateTokenImage(tokenOrTokenDocument)` – replace image for a single token
  - `updatePortraitImage(actorOrTokenOrTokenDocument)` – replace portrait for a single actor
  - `openTokenWindow(opts?)` – open token window; `opts: { token?, tokenDocument? }` to pre-select
  - `openPortraitWindow(opts?)` – open portrait window; `opts: { actor?, token?, tokenDocument? }` to pre-select
- [ ] **Curator:** Normalize API inputs: accept canvas `Token`, `TokenDocument`, or `Actor`; derive as needed for processing and for "selected" context in windows.
