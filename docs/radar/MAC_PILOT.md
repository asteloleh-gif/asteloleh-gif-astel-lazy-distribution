# Kevin cloud + existing Mac worker: bounded pilot

Scope: @astel.u only; manual visible login; one text post; one draft outside social UI.
No daemon or launchd startup, new worker, new key, cookie transfer, social writes, Distribution changes, CAPTCHA bypass, or Codex UI automation.

Existing worker: mac-radar-pilot. Keep its token in the existing Mac Keychain entry. Use the existing private launcher/configuration; never print its values or put tokens in arguments, files in this repo, chats or logs. Do not replace the registry. Profiles remain at the existing private root, account directory `astel.u--threads`.

## Release gate

The Hub and Mac must both have this setup-lifecycle fix before login. No schema migration is required. Existing create payload remains supported. The exact normalized query `manual login setup only` reserves a setup task. Worker-only `claimsetup` and `setupcomplete` use the same credentials, account scopes, leases and fencing. No new operator MCP action is required.

Success is SETUP_COMPLETE (not collected post evidence); unsuccessful close, wrong identity, challenge or uncertain outcome stays HOLD. Do not automatically resume HOLD or delete locks. An expired/unknown owner needs existing owner recovery after proof the browser stopped.

## Mac checks, without taking tasks

In the approved checkout, with existing private environment loaded:

```sh
node scripts/radar/smoke.mjs
```

Requires existing approved Playwright module absolute path, RADAR_BROWSER_AUTHORIZED=true and normal installed Chrome (`RADAR_BROWSER_CHANNEL=chrome`). It opens a temporary local page, closes it and removes its temporary profile. It neither contacts the coordinator nor visits a social site. Do not download/install anything on a failed smoke test.

## Create or find the already approved setup task

In the existing Hub container, through an already authorized administrative session:

```sh
node scripts/radar/pilot-setup.mjs inspect
node scripts/radar/pilot-setup.mjs create
```

This uses the existing LD_KEVIN_HUB_TOKEN internally over loopback; never copy that operator credential to Mac or use the Mac worker credential to create. The payload remains account=astel.u:threads, batch=manual-login-astel-u-20261028, query=manual login setup only. It checks the current list, and server create deduplication covers records outside that list's window. A network error is not permission to invent another batch or retry blindly: inspect the existing result first.

If no authorized SSH session is available, stop at this gate. MCP currently exposes no Radar commands; this pilot path does not prove Kevin has gained them. Do not repurpose Distribution endpoints or install a generic remote execution tool.

## Visible login on Mac

Only for the returned READY setup ID, use the existing private worker environment, RADAR_LOGIN_AUTHORIZED=true, RADAR_HEADLESS=false:

```sh
node scripts/radar/login.mjs TASK_ID
```

Oleg enters credentials and MFA in the browser, never the terminal/chat. Stop on CAPTCHA/access restriction. Press Enter only after login. Expected verified account is astel.u. Check task status after the command; require SETUP_COMPLETE. Never launch a second login if result is uncertain.

## One-post read and draft

Operator creates one distinct read task for astel.u after verifying setup finished. Start ONLY this returned task ID on Mac with one reviewed, actual Threads post URL:

```sh
node scripts/radar/worker.mjs READ_TASK_ID THREADS_POST_URL
```

The optional URL skips broad discovery and limits this run to one post. Browser verifies active identity; text-only evidence must identify author, date or unavailable date, source URL, and incomplete replies/unviewed media. If context is insufficient, stop without inventing a draft. Worker closes before COLLECTED. Operator reads evidence and generates one Russian draft, saved outside the social composer. Current video viewing remains uncertified.

## Acceptance status

Cloud code tests are not live Mac acceptance. Record separately:
- deployed fix SHA and Hub health;
- Mac checkout SHA and passive browser PASS;
- existing setup task ID, SETUP_COMPLETE, account identity;
- one actual URL, evidence and limitations;
- one draft or concrete reason to skip;
- Kevin's actual ability to invoke operator tools/API (still a separate gate).

This cloud chat has no Mac connection: Desktop Commander inventory on 2026-10-28 shows only an unrelated offline Windows device. Continue actual local execution in the existing Mac task; do not duplicate workers. No successful live browser read or Kevin autonomy is claimed.
