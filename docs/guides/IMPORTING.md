# Importing recipes

**Recipes → Import from a link**: paste the address of a recipe page and press Import. You get a draft to check and fix; nothing is saved until you press **Save recipe**.

## What works
- **Recipe websites.** Most sites include their recipe in a machine-readable form (schema.org "Recipe"), and TurboPantry reads that: title, photo, times, servings, ingredients (with quantities and groups such as "For the sauce") and method.
- **Osta share links** (`ostarecipes.com/recipes/…` or `ostarecipes.com/s/recipes/…`). Osta's pages only appear once a browser has run them, so the server opens the link in a hidden browser (Chromium) and reads the result. You get the title, photo, creator, times, servings and the ingredients with their groups. The method (Osta's *Directions*) is read too; if a recipe has none, add it in the Method box (pasted step numbers such as "1" and "2" are cleaned up for you). **If the Osta recipe was copied from a website, the import offers a button to import from that website instead**, which is usually cleaner and faster. This needs Chromium on the server (the installer adds it where it can; see [SELF_HOSTING.md](SELF_HOSTING.md)). Private or deleted recipes cannot be read.
- **Writing one yourself** (Recipes → Write one), or pasting text into the same form: one ingredient per line, one step per line.

## What does not work yet
| Source | Status |
|---|---|
| Instagram posts and reels | The server asks Instagram's public embed page for the caption (and any comments it shows) and reads the recipe from them, like Osta (it does not watch the video). **Instagram often hides posts without a login**: then the import says so and you paste the caption (and the comment with the recipe, if there is one) into the **Paste a caption instead** box. The same box works for TikTok captions, messages and anything else. Sharing a post from the Instagram app to TurboPantry (Android app) opens this page with the link filled in. |
| Pages with no machine-readable recipe | "No recipe was found on that page." Paste the text into **Write one**. |
| Sites that block automated readers | "The website refused the request." Same workaround. |

## Linking to your pantry
After importing (and when you save any recipe) each ingredient is linked to a pantry item so the recipe can say what you have and add only what is missing. The import page shows a **Link to your items** panel: lines that match an item you already have are linked, and only the ones that could be something you already have are listed for you to check. The kind of ingredient matters, so "fettuccine pasta" is offered "Pasta" as *less specific* and is not linked unless you choose it. See [PANTRY.md](PANTRY.md).

## Good to know
- The original wording of every ingredient line is kept, so if the quantity or unit is guessed wrong, nothing is lost: edit the line.
- Photos are linked from the original site, not copied. If the site removes the photo it disappears here too.
- Only public websites can be imported. The server will not fetch addresses on its own network (home router, other devices, cloud metadata), whatever is typed in.
