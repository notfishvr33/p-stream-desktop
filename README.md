# P-Stream Desktop

Desktop app for P-Stream (movie-web) that provides enhanced streaming capabilities through browser extension integration.

## Installation

```bash
pnpm install
```

## Development

```bash
pnpm start
```

## Building

Build the app for your current platform:

```bash
pnpm run build
```

Build for specific platforms:

```bash
pnpm run build:mac    # macOS
pnpm run build:win    # Windows
pnpm run build:linux  # Linux
```

The built files will be available in the `dist/` directory.

## Features

- Native desktop wrapper for P-Stream
- Enhanced streaming capabilities via browser extension
- Automatic update checking from GitHub releases
- Discord Rich Presence integration
- Cross-platform support (macOS, Windows, Linux)