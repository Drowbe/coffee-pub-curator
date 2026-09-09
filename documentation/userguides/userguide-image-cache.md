# The Image Cache

**Audience:** a GM whose scan is slow, or who has just added artwork and is wondering why Curator has
not noticed.

What the cache is, when to rescan, and why the thing that makes a scan slow is not the thing most
people expect.

## What it is

Curator cannot search your artwork without knowing what is in it. So it walks the folders you nominate
once, records every image and the tags it can derive, and keeps that index. Everything else — matching,
searching, filtering by tag — reads the index rather than the disk.

**Three separate caches**, one each for tokens, portraits and tiles, because they are three separate
folder lists. Scanning one does nothing for the others.

## Scanning

Open the relevant replacement window. If there is no cache it will offer to build one. If there is, you
get three choices:

- **Incremental** — look only at what changed. This is the one you want almost always.
- **Full Rescan** — start over. Slow, and rarely necessary.
- **Cancel** — closing the window with the X does the same thing.

**Rescan when you add or move folders.** New artwork is not noticed on its own.

Progress is shown while it runs, and the scan saves as it goes, so a crash or a closed tab does not
lose everything.

## Why a scan is slow — folders, not files

This is the useful thing on this page.

**The cost is the number of folders, not the number of images.** Every directory is one round trip to
Foundry's file backend, and that round trip is the expense. The images inside it are nearly free.

So:

- A thousand images in **one** folder scans quickly.
- A thousand folders with **one image each** is a thousand round trips, and takes far longer.

If a scan is dragging, count directories rather than files. Deep nested asset packs — and Foundry's own
`icons/` tree, which is about 150 folders — are the usual culprits.

**What to do about it:** nominate the specific folders you actually draw from rather than a parent that
contains everything. Use **Ignored Folders** to skip the ones you never want, `_gsdata_` and
`.DS_Store` being the common junk.

Curator scans several sibling folders at once to soften this, but the floor is one round trip per
folder and no amount of cleverness removes it.

## Storage, and why it matters on a big library

The cache lives in **world** settings, which means every save is written to the world database and sent
to every connected client. On a large library that payload is measured in megabytes.

Curator therefore saves **at most once every thirty seconds** during a scan, with one authoritative
save at the end. If you are watching and nothing appears to persist for a while, that is why — and it
is deliberate. An earlier version saved far more often and could take half an hour and crash the tab on
a large library.

**Practical consequence: scan once, with other people disconnected if you can.** It is a setup task,
not a session task.

## Keeping the index clean

Four settings decide what gets in, all comma-separated:

- **Ignored Folders** — never walked. Costs nothing to scan.
- **Ignored Words** — filenames matching are skipped. Supports `*`.
- **Ignored Tag Patterns** — tags matching are dropped. `00*`, `*X*` for dimensions.
- **Auto-Filter Garbage Tags** — discards tags that are obviously dimensions, variant codes, or bare
  numbers.

**Ignored Folders is the only one that makes a scan faster**, because it is the only one that avoids a
round trip. The others clean up results after the walking is done.

## Deleting a cache

Both image windows have a delete control. It asks first, tells you how many images it is discarding,
and cannot be undone — you rescan afterwards.

Worth doing if you have reorganised a library substantially and an incremental scan is leaving stale
entries behind.

## When something is missing

**An image I just added does not appear.** Rescan incrementally.

**A whole folder is missing.** Check it is in the folder list, and that it is not caught by **Ignored
Folders**. Check **Number of Image Folders** is high enough to include the slot you filled in — that
setting requires a reload when changed.

**Search finds nothing.** Try turning **Fuzzy Search** on.

**The cache seems empty after a scan that appeared to work.** Check the cache status display in the
window. If it reports zero, the paths probably do not resolve — paste one into a file picker to check.
