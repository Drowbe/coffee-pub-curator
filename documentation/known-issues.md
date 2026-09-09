# Known Issues

**Audience:** anyone using Curator who has hit something odd and wants to know whether it is them.

What does not work, or works in a way that surprises people. Things being actively built are in
`TODO.md` instead — this page is for behaviour you can run into today.

## Looting

**A packed container cannot be taken.** If a body carries a backpack with things inside it, you have to
empty the backpack first and take the contents separately. The container itself moves once it is empty.
This is a limit in the underlying transfer, not a rule Curator chose.

**Coins have no "who took what".** Every other item on a body records who looted it. Currency does not,
because a denomination is one balance several people draw down rather than a thing that changes hands —
so the window can show you what is left, but not who took the rest.

**Burying a body during combat loses its XP award.** Foundry removes the Combatant along with the Token,
and the experience total is read from the combat roster at the end. If you want the XP, bury after
combat rather than during it. Being fixed in Blacksmith at the source; Curator deliberately adds no
guard of its own, because one would only cover bodies buried *through Curator* and would hide the
general case from whoever fixes it properly.

**The loot window forgets its size.** Resize it and it opens at 520×560 again next time. Position is not
remembered either.

## Images

**A scan of a large library takes a while, and the cost is folders rather than files.** A thousand
images in one folder scans quickly; a thousand folders with one image each does not. If a scan feels
slow, the number of directories is the thing to look at. See
[the image cache guide](userguides/userguide-image-cache.md).

**Matching is a best guess, not a lookup.** The scoring system weighs the actor's name, the token's
name, the creature type and several other signals, and it can be confidently wrong — particularly for
tokens whose names describe a role rather than a creature ("Guard Captain", "Villager 3"). Every
automatic replacement can be overridden by hand from the replacement window.

## Compatibility

**Foundry v13 and v14 are both supported**, verified on v14. v13 support is held until v13 breaks rather
than dropped on a schedule.

**Blacksmith 14.1.0 or newer is required.** Older builds are missing APIs Curator calls directly, and
Foundry will refuse to enable Curator rather than letting it half-work.

**Item Piles is no longer used, recommended, or checked for.** Curator used to convert dead tokens into
Item Piles and that module was effectively required. Bodies converted by a Curator older than 13.3.0 are
still Item Piles and are left alone; newly prepared bodies use Curator's own state. If you are upgrading
from 13.2.x or earlier, note that 13.3.0 set `"socket": true` in the manifest, which needs a **world
restart** rather than a browser refresh.

## Reporting something not listed here

[Open an issue](https://github.com/Drowbe/coffee-pub-curator/issues). The console output is worth more
than a description — press F12, reproduce the problem, and copy anything red.
