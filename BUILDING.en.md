# Building

[Español](BUILDING.md) | **English**

## Requirements

- Windows 10 or 11.
- Node.js 20 or later.
- npm.
- An Internet connection during the first Windows runtime build.

APK export also requires a JDK and Android SDK with Build Tools 35.0.0 or later.

The first APK export creates a local signing identity under `%USERPROFILE%\.scrapp`. Keep a backup of that directory if you need to publish future updates for the same APKs.

## Setup

```powershell
npm install
npm test
```

## Scrapp executable

```powershell
npm run build:exporter
```

The result is written to `outputs/Scrapp.exe`. The `outputs` directory and temporary files under `work` are not part of the source code.
