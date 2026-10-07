# Twitch Pins for Brave

An extension separate from Live Radar. It adds a **PINNED** section above followed channels in the Twitch sidebar, including on the homepage. Try a streamer before deciding to follow. The extension does not follow, unfollow, subscribe, or unsubscribe.

## Install

1. Extract `twitch-pins.zip`, or download and extract this repository.
2. Open `brave://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the `twitch-pins` folder containing this extension’s manifest. Live Radar lives in the separate `live-radar` folder.
4. Reload your open Twitch tabs. Pin **Twitch Pins** to the Brave toolbar.

No packages, build step, developer account, API key, or login authorization are required. Keep the extension folder on disk while it is installed.

## Usage

- Open a Twitch channel. A button with a **pin icon**, without text, appears aligned with the **Follow/Subscribe** actions when the Twitch layout allows it. Click to pin; the pin becomes highlighted. Click again to unpin. Its action appears on hover and is available to screen readers.
- If the header is not recognized, the same button appears in the bottom-right corner of the channel page.
- Pinned channels appear above followed channels in the sidebar. Click a channel to open it or **×** to unpin. The list keeps your chosen order, with new pins at the top.
- Use the **eye button** in the section heading to collapse or expand your pins. This preference is saved and synced across your open tabs. Collapsing the list keeps your pins, and the eye button remains available in the narrow sidebar.
- Open the extension icon or the section’s gear button to add a channel by login or URL and use **↑ / ↓** to reorder the list.
- In the collapsed sidebar, pins appear as avatars; hover to see the name and status. Use the extension panel on pages without a sidebar.
- Supports up to **50 channels**. The list is stored locally, persists across browser restarts, and updates in other Twitch tabs. It is not synced across devices or browser profiles.

## Status

Checks channels every **2 minutes** while Brave is open and shows **Live**, **Offline**, **Checking**, or **Status unavailable**. For live channels, the sidebar shows the **viewer count**, **game/category**, and **stream title**. Long text is shortened with an ellipsis, and the full text appears on hover. These details also appear in the panel. The extension badge shows the number of channels confirmed live.

Only the current channel status is stored. Network errors do not automatically make a channel offline: the interface shows that status is unavailable and keeps the last known result.

## Update to 1.2.2

Copy the new files into the **same folder** used for the previous installation, click **Reload** on the extension card in `brave://extensions`, and reload your Twitch tabs. Using the same folder keeps the extension ID and saved channels. Version 1.2.2 uses English for labels, tooltips, messages, and number formatting. It retains the overflow fix from 1.2.1: text stays inside the sidebar and panel, long text uses an ellipsis, and large viewer counts are abbreviated. Hover to see full values and text. Your pins, their order, and the eye button preference are preserved.

## Compatibility and privacy

The list and buttons are rendered by scripts restricted to `twitch.tv`. `storage` saves pins, current status, and the eye button preference; `alarms` schedules checks. Network permission for `gql.twitch.tv` allows **read-only** requests to the endpoint used by Twitch’s public website, using the website’s public identifier. That identifier is not a password or a personal token. The extension does not extract cookies, intercept credentials, request account scopes, change followers, or send data to a separate server.

The website endpoint is **unofficial for extensions** and may change or block requests. Layout changes may also require updates to sidebar and button selectors. Pinning, unpinning, and reordering continue to work locally if the status service fails. Do not disable Brave Shields to use the extension; check errors in the panel.

## Development and validation

In the `twitch-pins` folder, with Node.js 20 or later and no dependency installation:

```sh
npm test
```

Tests cover channel normalization, list limits and order, eye button persistence, migration without losing pins, lookups, network errors, and changes made during a lookup. They do not require real accounts.

To validate in Brave, open a channel, use the pin, return to the homepage, and confirm it appears above followed channels. Test the eye button and its persistence after reloading, unpinning, panel reordering, collapsing the sidebar, and navigating between channels without a full page reload. Pin a channel that is actually live and another that is offline, then use **Refresh** to confirm their status.

The development machine’s Chromium policy blocks extension loading, and its network blocks `gql.twitch.tv`. Real Twitch integration must be checked in your installation. Browser tests use a representative Twitch page and simulated APIs; they do not establish compatibility with every current version of the site. Layout checks include very long titles and category names, large viewer counts, and sidebar widths from 54 to 240 pixels.
