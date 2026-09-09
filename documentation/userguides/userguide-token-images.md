# Token and Portrait Images

**Audience:** a GM with folders of artwork who is tired of picking images by hand.

How Curator finds the right picture for a token or a portrait, how to tell it what "right" means, and
what to do when it guesses badly. Scanning the folders in the first place is
**[The image cache](userguide-image-cache.md)**.

## The idea

Point Curator at folders of artwork. It indexes them. From then on it can look at a token — its name,
its actor's name, its creature type, its size, its equipment — and rank your images by how well they
fit.

**Token** and **portrait** are the same machinery pointed at different targets, with **separate
folders, separate caches and separate settings**. Turning one on does nothing to the other.

- **Enable Token Replacement** — the token on the canvas.
- **Replace Portraits** — the actor's portrait image.

## Doing it by hand

The reliable way, and the one to learn first.

1. Select a token.
2. Open **Curator** in the Blacksmith menubar, then **Replace Token**.
3. You get a ranked list. Click an image to apply it.

**Replace Canvas Tokens** does every token on the scene in one go. Useful after importing a map full of
placeholder art — and alarming if you have already hand-picked images, because it replaces those too.

Two settings control where the buttons appear: **Show in CoffeePub Toolbar** and **Show in FoundryVTT
Toolbar**.

## Doing it automatically

**Update Dropped Token Images** replaces a token's art the moment it lands on the canvas.
**Update Dropped Portraits** does the same for the actor's portrait.

Then four switches decide *what* gets touched, for tokens and portraits separately:

**Update Monsters · Update NPCs · Update Vehicles · Update Actors**

And one that catches people out:

**Skip Linked Tokens.** A linked token shares its actor with every other copy, so replacing its art
changes all of them and the actor itself. Leaving this on is the safe choice — it means automatic
replacement only touches unlinked tokens, which are the throwaway ones.

## Telling it what "right" means

### Matching Threshold

How good a match has to be before it is used. **Lower is fuzzier, higher is stricter.**

Too low and every goblin gets the first goblin-ish picture. Too high and nothing matches at all and you
wonder if the scan worked. If automatic replacement seems to do nothing, this is the first thing to
check.

### Fuzzy Search

Off means exact string matching only. Leave it on unless your filenames are rigidly systematic.

### Variability

When several images tie for the best score, pick one at random. **Turn this on for anything you place
in numbers** — otherwise eight goblins all get the same picture.

### Data Weighting

Eight sliders deciding what the score is made of:

**Actor Name · Token Name · Represented Actor · Creature Type · Creature Subtype · Equipment · Size ·
Tags**

Raise the ones your library actually supports. If your files are named after creatures, Actor Name and
Token Name carry the work. If they are sorted into folders by type with generic filenames, Creature
Type matters more and names matter less.

This is the setting to reach for when matching is *consistently* wrong in the same direction, rather
than wrong about one token.

## Keeping rubbish out of the index

Four filters, all of which take comma-separated lists:

- **Ignored Folders** — never scanned. `_gsdata_, .DS_Store`
- **Ignored Words** — filenames containing these are skipped. Supports `*`: `*Scale*, *alternate*`
- **Deprioritized Words** — still indexed, ranked lower. `spirit`
- **Ignored Tag Patterns** — tags matching these are dropped. `00*, *X*`

And one switch worth leaving on: **Auto-Filter Garbage Tags** discards tags that are obviously
dimensions (`16X32`), variant codes (`001A`) or bare numbers.

**Deprioritized is the useful one and the least used.** Ignored words remove an image entirely; a
deprioritized word keeps it available for when nothing better exists.

## When the guess is wrong

**It picks the same wrong thing every time.** Data Weighting. Something is scoring higher than it
deserves for your library.

**It picks nothing.** Matching Threshold is too high, or the folders were never scanned.

**Tokens named after roles match badly** — "Guard Captain", "Villager 3". These describe a job, not a
creature, and no weighting fixes that. Replace them by hand.

**Everything looks identical.** Turn on Variability.

**It replaced art I had chosen.** Almost certainly Update Dropped, or Replace Canvas Tokens. Consider
turning on Skip Linked Tokens.

## Portraits have their own everything

Every setting above exists twice. **Portrait Image Folders** is a separate list from **Token Image
Folders**, and the caches do not share. Setting up tokens does not set up portraits.
