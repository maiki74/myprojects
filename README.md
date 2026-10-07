# Live Radar & Twitch Pins

Two independent extensions for Brave and other Chromium browsers. Each project has its own folder, manifest, and installation guide.

| Project | What it does | Files and guide |
| --- | --- | --- |
| **Live Radar** | Notifies you when Twitch and YouTube channels go live, with actions to ignore, watch, or open muted in the background. | [live-radar](live-radar/README.md) |
| **Twitch Pins** | Pins channels above your followed channels on Twitch, with a compact pin button and an eye button to collapse the list. | [twitch-pins](twitch-pins/README.md) |

## Install in Brave

1. Download the repository using **Code → Download ZIP** and extract the files.
2. Open `brave://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select `live-radar` or `twitch-pins`.
4. Reload any tabs that were already open. To install both extensions, repeat the previous step with the other folder.

No build or dependency installation is required. Live Radar requires a Twitch connection to monitor that platform; see its guide. Twitch Pins stores your pins locally and does not require that connection.

To update an existing extension and keep your local settings, copy the new files into the same installation folder, reload the extension in Brave, and reload your tabs.

## Tests

With Node.js 20 or later, run this from the repository root:

```sh
npm test
```

You can also run `npm test` inside each project folder. Tests use simulated responses and do not require real accounts or credentials. Each extension’s guide describes its validation coverage and site integration limits.
