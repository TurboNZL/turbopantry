# Getting started

TurboPantry keeps your recipes and a shopping list you can share with the people you live with. It runs on a computer you own (a home server, a Raspberry Pi, a NAS) and you open it in a browser or on your phone.

## 1. Start a server
Follow [SELF_HOSTING.md](SELF_HOSTING.md): one command on a Linux machine or Raspberry Pi installs and starts it. It prints your token.

## 2. Make an account for each person
The installer made the first account (the owner). To add the people you share with, run `add-user` once per person (the command is in SELF_HOSTING.md). It prints that person's token a single time; only a fingerprint is stored, so a lost token means making a new account.

## 3. Sign in on each device
Open the server's address. Go to **Settings → Server**, paste the token, press **Save and test**. It says who you are signed in as.

## 4. Make it yours
**Settings → Appearance** has many colour themes and UI styles, four layouts (side bar, icon rail, top tabs, bottom dock) and an optional wallpaper. Your choices stay on this device.

## 5. Add your first recipe
**Recipes → Import from a link** (see [IMPORTING.md](IMPORTING.md)), or **Write one**. Open a recipe to change the number of servings: the quantities scale with it. Amounts are in bold, the ingredients are bold inside the method, and **Amounts on/off** hides every quantity (in the list and in the method) when you just want to see what goes in.

## What is not here yet
Shopping lists and importing from Instagram. The Shopping page exists but is empty. This guide will grow as they land.
