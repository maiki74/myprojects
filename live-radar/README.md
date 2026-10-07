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

The official API requires a Client ID and an OAuth connection. This project does not include shared credentials.

1. Visit <https://dev.twitch.tv/console/apps>, enable two-factor authentication on your account, and register an application.
2. Choose **Browser Extension** as the category if available. This extension uses the implicit OAuth flow; keep the application type set to **Confidential** for this flow (**Public** is intended for Twitch’s device code flow). The implicit flow does not use a Client Secret: do not generate, share, or include one in the extension. Add the OAuth URL shown in the extension’s settings to the application’s redirect URL list. Each installation may have a different ID; use the URL shown in your installation.
3. Paste the **Client ID**, save, and click **Connect Twitch**. Authorize the connection in the Twitch window.
4. Enter streamer logins, such as `alanzoka`, or channel URLs.

The implicit authorization flow does not use a Client Secret or request extra chat or account management permissions. The token is validated on browser startup and at least once per hour while Twitch channels are configured. It stays in the extension’s local storage and is not synced. When it expires or is revoked, the panel asks you to reconnect. **Disconnect** revokes the token on Twitch.

## YouTube

Add `@handle`, `https://www.youtube.com/@handle`, or a `https://www.youtube.com/channel/UC…` URL.

The extension checks the channel’s public `/live` page and confirms `isLiveNow` in the player data. It also handles pages that show a live tab instead of redirecting to a stream. No API key is required, and it does not execute page scripts. The stream owner must match a channel in your list; recommendations from other channels do not trigger alerts. When needed, the extension resolves the @handle through the channel page’s metadata. If YouTube cannot confirm a handle, use the `UC…` ID.

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

`storage` saves lists, the connection, and status; `alarms` schedules checks; `notifications` creates desktop alerts; `tabs` finds tabs for alerts and opens or mutes streams; `identity` connects Twitch. The content script runs on HTTP/HTTPS pages to display alerts, but does not read or send the contents of visited pages. Stream titles are displayed as text, without interpreting HTML.

The only external services queried are `api.twitch.tv`, `id.twitch.tv`, and `www.youtube.com`. When you choose to watch, Brave opens the corresponding site normally. There is no analytics or data collection on a separate server. The extension does not disable Brave Shields; blocked services produce an error in the panel.

## Update to 1.0.1

Copy the new files into the **same folder** used for the previous installation, reload the extension in `brave://extensions`, and reload your tabs. Version 1.0.1 uses English throughout the interface, alerts, and error messages. Using the same folder keeps the extension ID and saved settings.

## Development and validation

With Node.js 20 or later, run:

```sh
cd live-radar
npm test
```

Tests cover live stream recognition, scheduled streams, channel ownership, deduplication, worker restarts, network errors, authorization, settings isolation, pausing during a lookup, and the order of opening and muting tabs. They use simulated responses and do not require real accounts or credentials.

For browser validation, load the folder as an extension, use **Test alert**, and try all three actions on a regular page. Then configure a channel that is actually live and click **Check now**. Twitch authentication and real YouTube detection require validation in your installation.

### Validation in this environment

Automated tests passed. The settings page, popup, and three alert buttons were exercised in Chromium with simulated extension APIs. This environment’s Chromium policy blocks unpacked extensions, so a complete extension installation could not be verified here. The environment’s network also blocked public YouTube requests. No Twitch account authentication or real live stream detection was verified. Complete those checks in your Brave installation.
