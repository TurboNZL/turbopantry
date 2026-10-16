# Importing recipes

**Recipes → Import from a link**: paste the address of a recipe page and press Import. You get a draft to check and fix; nothing is saved until you press **Save recipe**.

## What works
- **Recipe websites.** Most sites include their recipe in a machine-readable form (schema.org "Recipe"), and TurboPantry reads that: title, photo, times, servings, ingredients (with quantities and groups such as "For the sauce") and method.
- **Osta share links** (`ostarecipes.com/recipes/…` or `ostarecipes.com/s/recipes/…`). Osta's pages only appear once a browser has run them, so the server opens the link in a hidden browser (Chromium) and reads the result. You get the title, photo, creator, times, servings and the ingredients with their groups. The method (Osta's *Directions*) is read too; if a recipe has none, add it in the Method box (pasted step numbers such as "1" and "2" are cleaned up for you). **If the Osta recipe was copied from a website, the import offers a button to import from that website instead**, which is usually cleaner and faster. This needs Chromium on the server (the installer adds it where it can; see [SELF_HOSTING.md](SELF_HOSTING.md)). Private or deleted recipes cannot be read.
- **Writing one yourself** (Recipes → Write one), or pasting text into the same form: one ingredient per line, one step per line.

## What does not work yet
| Source | Status |
|---|---|
| Instagram posts and reels | Tried in this order: (1) the public embed page, which gives the caption and any comments it shows; (2) if the owner has logged TurboPantry in to a spare Instagram account (see below), the post is opened as that account and the caption and comments are read, the creator's own comments first, because that is where the recipe usually is; (3) otherwise the import says so and you paste the caption (and the comment with the recipe, if there is one) into the **Paste a caption instead** box. The same box works for TikTok captions, messages and anything else. It never watches the video. Sharing a post from the Instagram app to TurboPantry (Android app) opens this page with the link filled in. |
| Pages with no machine-readable recipe | "No recipe was found on that page." Paste the text into **Write one**. |
| Sites that block automated readers | "The website refused the request." Same workaround. |

## Logging in to Instagram
Instagram hides most posts from visitors who are not logged in. The owner (the first account) can give the server a login so that it can read them: **Settings → Server → Instagram**.

- **Use a dummy account.** Make a spare Instagram account just for this, never your own. Instagram's terms discourage automated access, so the account may be restricted, asked to confirm it is really you, or signed out now and then.
- **The password is used once and never stored.** The server types it into Instagram's login page in a hidden browser (Chromium, the same one Osta links use) and keeps only the resulting login session, in `instagram-session.json` in the server's data folder, readable only by the server's user. **Log out** deletes it.
- **Two-step login.** If the dummy account has two-factor login, TurboPantry asks for the code (text message or authentication app) and finishes the login.
- **"Suspicious login" or "confirm it's you".** Open the dummy account in its own Instagram app (or its e-mail), approve the login ("This was me"), then log in again here. Do not retry in a loop: too many attempts is what makes Instagram restrict an account.
- **Gentle on the account.** The server reads one post at a time, waits between posts and allows only a few a minute.
- **If Instagram signs the account out**, an import says so ("log in again") instead of guessing. Log in again, or use the paste box.
- Only the owner can see this card. Anyone on the server can import, and uses the session without seeing it.
- This reads the public caption and the comments the page shows (the creator's own are preferred). It cannot see private accounts the dummy account does not follow.

## Linking to your pantry
After importing (and when you save any recipe) each ingredient is linked to a pantry item so the recipe can say what you have and add only what is missing. The import page shows a **Link to your items** panel: lines that match an item you already have are linked, and only the ones that could be something you already have are listed for you to check. The kind of ingredient matters, so "fettuccine pasta" is offered "Pasta" as *less specific* and is not linked unless you choose it. See [PANTRY.md](PANTRY.md).

## Good to know
- The original wording of every ingredient line is kept, so if the quantity or unit is guessed wrong, nothing is lost: edit the line.
- Photos are linked from the original site, not copied. If the site removes the photo it disappears here too.
- Only public websites can be imported. The server will not fetch addresses on its own network (home router, other devices, cloud metadata), whatever is typed in.
