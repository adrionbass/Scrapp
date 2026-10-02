# Architecture

[Español](ARCHITECTURE.md) | **English**

Scrapp uses Electron for its desktop interface and TurboWarp Packager to run and package Scratch projects.

## Directories

- `desktop/`: interface, main process, and Windows/Android exporters.
- `src/`: project validation and preparation of the Windows runtime used to build Scrapp.
- `tools/`: build script and source files for the self-contained launcher.
- `tests/`: automated tests and minimal fixtures.

## Export flow

1. An `.sb3` file is loaded or a public Scratch project is downloaded.
2. TurboWarp prepares the project and its runtime.
3. The exporter generates the selected target.
4. Windows produces a single `.exe`; Android produces a signed `.apk`.

## Modes

- `test`: Control Mode, with run, pause, stop, volume, and turbo controls.
- `final`: Final Mode, with automatic startup and volume control.

Temporary files are created outside the source tree and removed when each operation finishes.
