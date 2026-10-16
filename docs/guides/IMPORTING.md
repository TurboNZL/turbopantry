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

**Recommended: Log in on Instagram's own page.** Press that button and a live view of a browser running on your server opens, showing Instagram's real login page. Tap a field in the picture, type in the **Type here** bar under it and press **Send** (Backspace, Tab and Enter buttons are there too; drag the picture to scroll; on a computer you can also just type with the picture focused). You do everything yourself, including the two-step code, "Was this you?" questions and cookie pop-ups, so nothing depends on how Instagram words them. When Instagram logs the browser in, the server checks the login works, saves it and closes the browser. The window closes by itself after 10 minutes (a countdown is shown), when you press Cancel, or when you leave the page. Your password goes from your keys into Instagram's page: TurboPantry never sees it as a value, and never stores it.

- **If the picture stays blank or shows "try again later".** The line "What the server sees" under the picture says which page the server's browser got, the web status code and the first words on the page. Instagram sometimes refuses logins from servers (a home server is an unusual place to log in from). Cancel, wait an hour or two, and try again once; do not retry in a loop. If it keeps happening, send that line to whoever maintains TurboPantry. TurboPantry uses an ordinary Chromium and does not disguise it, so Instagram may still decide it is an automated browser.
- **The username and password form** (under "Use a username and password instead") still works as a fallback: the server types them into Instagram's page once. If the account has two-step login TurboPantry asks for the code.
- **Use a dummy account.** Make a spare Instagram account just for this, never your own. Instagram's terms discourage automated access, so the account may be restricted, asked to confirm it is really you, or signed out now and then.
- **Only the login session is kept,** in `instagram-session.json` in the server's data folder, readable only by the server's user. **Log out** deletes it.
- **"Suspicious login" or "confirm it's you".** In the live view just follow Instagram's steps. With the form, open the dummy account in its own Instagram app (or its e-mail), approve the login ("This was me"), then log in again.
- **Gentle on the account.** The server reads one post at a time, waits between posts and allows only a few a minute. Only one login window or import uses Instagram at a time.
- **If Instagram signs the account out**, an import says so ("log in again") instead of guessing. Log in again, or use the paste box.
- Only the owner can see this card. Anyone on the server can import, and uses the session without seeing it.
- This reads the public caption and the comments the page shows (the creator's own are preferred). It cannot see private accounts the dummy account does not follow.

## Linking to your pantry
After importing (and when you save any recipe) each ingredient is linked to a pantry item so the recipe can say what you have and add only what is missing. The import page shows a **Link to your items** panel: lines that match an item you already have are linked, and only the ones that could be something you already have are listed for you to check. The kind of ingredient matters, so "fettuccine pasta" is offered "Pasta" as *less specific* and is not linked unless you choose it. See [PANTRY.md](PANTRY.md).

## Good to know
- The original wording of every ingredient line is kept, so if the quantity or unit is guessed wrong, nothing is lost: edit the line.
- Photos are linked from the original site, not copied. If the site removes the photo it disappears here too.
- Only public websites can be imported. The server will not fetch addresses on its own network (home router, other devices, cloud metadata), whatever is typed in.
