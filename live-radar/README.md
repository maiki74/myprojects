# Live Radar for Brave

A Manifest V3 extension that monitors a list of Twitch streamers and YouTube channels. When a new stream starts, it shows an alert in the active tab with **Ignore**, **Background, muted**, and **Watch**. It does not require a separate server.

## Install

1. Download this project and extract the ZIP if needed.
2. Open `brave://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the folder containing `manifest.json`.
4. Pin **Live Radar** to the browser toolbar and open **Settings**.
5. Add channels, one per line, and save. Reload tabs that were open before installation to enable in-tab alerts.
6. Use **Test alert**, then open a regular HTTP/HTTPS page to try the three buttons.

No packages or build step are required. Keep the extension folder on disk while it is installed.

## Twitch

Add streamer logins, such as `alanzoka`, or channel URLs, then save. **No Twitch login, application registration, API key, or OAuth connection is needed.**

Live Radar uses read-only queries to the public website endpoint at `gql.twitch.tv`, using the same anonymous access as Twitch Pins. The website’s public Client ID is included in the extension; it is not a password, a personal token, or a secret you need to configure. Requests omit browser cookies and do not send an Authorization header.

The stream ID identifies each broadcast so repeated checks and worker restarts do not repeat an alert. Lookups run in batches of up to 20 channels. A failed query preserves the last known status, appears in the panel, and does not prevent other channels in the batch from being checked.

This endpoint is unofficial for extensions. Twitch may change its response format, restrict anonymous access, or rate-limit requests. The extension reports lookup errors rather than asking you to log in or treating failed requests as confirmed offline.

## YouTube

Add `@handle`, `https://www.youtube.com/@handle`, or a `https://www.youtube.com/channel/UC…` URL.

The extension checks the channel’s public `/live` page and confirms `isLiveNow` in the player data. It also handles pages that show a live tab instead of redirecting to a stream. No YouTube login or API key is required. Requests omit browser cookies, and the extension does not execute page scripts. The stream owner must match a channel in your list; recommendations from other channels do not trigger alerts. When needed, the extension resolves the @handle through the channel page’s metadata. If YouTube cannot confirm a handle, use the `UC…` ID.

This mechanism depends on YouTube’s public page format. Consent pages, format changes, rate limits, and private, restricted, or members-only streams may prevent detection. Errors appear in the panel and preserve the last known status; a channel with an error is not automatically treated as offline. The panel may therefore show an older status while a lookup fails.

## Alert behavior

- **Ignore:** removes the alert from all tabs without opening the stream.
- **Background, muted:** creates an unfocused tab, mutes it before navigation, and loads the stream. Brave or the site’s autoplay policy may require you to start playback manually.
- **Watch:** opens the stream in a new active tab.
- The extension panel shows each channel’s last known status. It also lets you open a stream after ignoring its alert.
- Each stream produces one alert, including across browser restarts. A new stream from the same channel produces another alert.
- The default check interval is **2 minutes**, configurable from 1 to 60. Alerts are not instant: sleep, network issues, and browser power saving may delay checks. Brave must be open.
- The three newest alerts appear in the visible tab. Older pending alerts reappear as newer ones are dismissed. Up to 20 alerts are retained for up to 6 hours.
- Desktop notifications have two buttons: **Watch** and **Background, muted**. Closing one ignores the alert. Button support depends on your operating system and notification settings.
- Internal pages (`brave://`, `chrome://`), extension stores, other extensions’ pages, and built-in PDF viewers do not support injected alerts; use desktop notifications there. Incognito windows require you to allow the extension in that mode.

## Permissions and privacy

`storage` saves lists and status; `alarms` schedules checks; `notifications` creates desktop alerts; `tabs` finds tabs for alerts and opens or mutes streams. The content script runs on HTTP/HTTPS pages to display alerts, but does not read or send the contents of visited pages. Stream titles are displayed as text, without interpreting HTML.

The only external services queried are `gql.twitch.tv` and `www.youtube.com`. When you choose to watch, Brave opens the corresponding site normally. There is no analytics or data collection on a separate server. The extension does not disable Brave Shields; blocked services produce an error in the panel.

## Update to 1.1.0

Copy the new files into the **same folder** used for the previous installation, reload the extension in `brave://extensions`, and reload your tabs. Version 1.1.0 removes Twitch login and Client ID setup. Twitch and YouTube monitoring work without an account connection. Your channel lists, notification preferences, and existing stream sessions are preserved. Old locally stored Twitch credentials are removed on update or browser startup. The interface and documentation remain in English.

## Development and validation

With Node.js 20 or later, run:

```sh
cd live-radar
npm test
```

Tests cover live stream recognition, scheduled streams, channel ownership, deduplication, worker restarts, network errors, anonymous requests, removal of legacy credentials, settings isolation, pausing during a lookup, and the order of opening and muting tabs. They use simulated responses and do not require real accounts or credentials.

For browser validation, load the folder as an extension, use **Test alert**, and try all three actions on a regular page. Then configure a channel that is actually live and click **Check now**. Confirm live detection without signing into Twitch or YouTube in your installation.

### Validation in this environment

Automated tests passed. The settings page, popup, and three alert buttons were exercised in Chromium with simulated extension APIs. This environment’s Chromium policy blocks unpacked extensions, so a complete extension installation could not be verified here. The environment’s network also blocked public Twitch and YouTube requests. Real live stream detection was not verified from this machine. Complete those checks in your Brave installation.
