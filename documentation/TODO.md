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


## Curator UI

- Decide how Curator should handle asset defaults that currently point into Blacksmith paths. Confirm whether those assets should stay shared, be duplicated into Curator, or be redirected through a Blacksmith-provided asset API/constant layer.
- Migrate the neutral chat-card theme from internal `default` / `theme-default` naming to `tan` / `theme-tan` for consistency with the other color themes. This needs a deliberate migration plan because saved world settings, existing templates/selectors, and dependent Coffee Pub modules may still rely on the current IDs/classes.