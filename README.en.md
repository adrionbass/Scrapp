# Scrapp

[Español](README.md) | **English**

Scrapp converts Scratch projects into standalone applications for Windows and Android through a straightforward interface designed for educational use.

> Scrapp is an independent project. It is not affiliated with, sponsored by, or endorsed by the Scratch Foundation or TurboWarp.

![Scrapp main interface](docs/images/scrapp-main.png)

## Features

- Import `.sb3` files and public projects through a URL.
- Export a single `.exe` file for Windows.
- Export `.apk` applications for Android.
- Control Mode with run, pause, stop, volume, mute, and turbo controls.
- Final Mode with automatic startup and volume control.
- 32-bit and 64-bit Windows applications.
- Resizable windows that preserve the project's aspect ratio.
- Spanish and English interface.
- Light and dark themes.

## Download

Compiled versions are distributed through the [Releases](https://github.com/adrionbass/Scrapp/releases) section. The executable is not stored directly in the repository because it exceeds GitHub's usual file-size limit.

## Requirements

### General use

- Windows 7 SP1, 8, 8.1, 10, or 11.
- An Internet connection to import projects by URL and download components that are not already cached.

### Android export

- A compatible JDK.
- Android SDK.
- Android Build Tools 35.0.0 or later.
- Android 6.0 / API 23 or later on the target device.

## Usage

1. Open an `.sb3` file or paste the URL of a public project.
2. Choose Windows or Android.
3. Select Control Mode or Final Mode.
4. Select the architecture when exporting for Windows.
5. Press **Create app**.

By default, generated files are saved to the Desktop. You can change the destination through the **Output** field.

## Development

Node.js 20 or later is required.

```powershell
npm install
npm test
npm run build:exporter
```

The Scrapp executable is generated at `outputs/Scrapp.exe`.

Additional technical information:

- [Building](BUILDING.en.md)
- [Compatibility](COMPATIBILITY.en.md)
- [Architecture](docs/ARCHITECTURE.en.md)
- [Third-party components](THIRD_PARTY_NOTICES.en.md)

## Responsibility for projects

Each user is responsible for obtaining permission to use and distribute the scripts, images, sounds, extensions, and other content included in projects converted with Scrapp.

## License

Scrapp's original code, visual identity, and official binaries are protected by the [Scrapp Proprietary License](LICENSE.en.md). Official binaries may be used for personal and educational purposes, but they may not be redistributed, modified, or sold without written permission.

Third-party components remain subject to their respective licenses, as detailed in [THIRD_PARTY_NOTICES.en.md](THIRD_PARTY_NOTICES.en.md).

## Author

**Adriel Miño**  
11:11 &lt;dev&gt;

- [GitHub](https://github.com/adrionbass)
- [LinkedIn](https://www.linkedin.com/in/adrielyosoy/)
