# Getting started

TurboPantry keeps your recipes and a shopping list you can share with the people you live with. It runs on a computer you own (a home server, a Raspberry Pi, a NAS) and you open it in a browser or on your phone.

## 1. Start a server
Follow [SELF_HOSTING.md](SELF_HOSTING.md): it is a single Node file you unpack and run (Docker is available as an option).

## 2. Make an account for each person
On the server, run `add-user` once per person. It prints that person's access token a single time; only a fingerprint of it is stored, so a lost token means making a new account name or asking the owner to reset it.

## 3. Sign in on each device
Open the server's address. Go to **Settings → Server**, paste the token, press **Save and test**. It says who you are signed in as.

## 4. Make it yours
**Settings → Appearance** has many colour themes and UI styles, four layouts (side bar, icon rail, top tabs, bottom dock) and an optional wallpaper. Your choices stay on this device.

## 5. Add your first recipe
**Recipes → Import from a link** (see [IMPORTING.md](IMPORTING.md)), or **Write one**. Open a recipe to change the number of servings: the quantities scale with it.

## What is not here yet
Shopping lists, importing from Instagram and from Osta links. The Shopping page exists but is empty. This guide will grow as they land.
