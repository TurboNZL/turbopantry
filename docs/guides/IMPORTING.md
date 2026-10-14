# Importing recipes

**Recipes → Import from a link**: paste the address of a recipe page and press Import. You get a draft to check and fix; nothing is saved until you press **Save recipe**.

## What works
- **Recipe websites.** Most sites include their recipe in a machine-readable form (schema.org "Recipe"), and TurboPantry reads that: title, photo, times, servings, ingredients (with quantities and groups such as "For the sauce") and method.
- **Osta share links** (`ostarecipes.com/recipes/…` or `ostarecipes.com/s/recipes/…`). Osta's pages only appear once a browser has run them, so the server opens the link in a hidden browser (Chromium) and reads the result. You get the title, photo, creator, times, servings and the ingredients with their groups. **Osta's share pages do not show the method**, so you add the steps yourself. This needs Chromium on the server (the installer adds it where it can; see [SELF_HOSTING.md](SELF_HOSTING.md)). Private or deleted recipes cannot be read.
- **Writing one yourself** (Recipes → Write one), or pasting text into the same form: one ingredient per line, one step per line.

## What does not work yet
| Source | Status |
|---|---|
| Instagram posts and reels | Not built yet. Copy the caption into **Write one** for now. |
| Pages with no machine-readable recipe | "No recipe was found on that page." Paste the text into **Write one**. |
| Sites that block automated readers | "The website refused the request." Same workaround. |

## Good to know
- The original wording of every ingredient line is kept, so if the quantity or unit is guessed wrong, nothing is lost: edit the line.
- Photos are linked from the original site, not copied. If the site removes the photo it disappears here too.
- Only public websites can be imported. The server will not fetch addresses on its own network (home router, other devices, cloud metadata), whatever is typed in.
