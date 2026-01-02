<p align="center">
  <img src="CinephageLogo.png" alt="Cinephage" width="200">
</p>

<h1 align="center">Cinephage</h1>

<p align="center">
  <strong>Self-hosted media management. Everything in one app.</strong>
</p>

<p align="center">
  <a href="https://www.gnu.org/licenses/gpl-3.0"><img src="https://img.shields.io/badge/License-GPLv3-blue.svg" alt="License: GPL v3"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node.js Version"></a>
  <a href="#"><img src="https://img.shields.io/badge/status-Alpha%20%C2%B7%20Active%20Development-orange" alt="Status: Alpha - Active Development"></a>
  <a href="https://github.com/MoldyTaint/Cinephage/issues"><img src="https://img.shields.io/github/issues/MoldyTaint/Cinephage" alt="GitHub Issues"></a>
  <a href="https://discord.gg/scGCBTSWEt"><img src="https://img.shields.io/discord/1449917989561303165?color=5865F2&logo=discord&logoColor=white&label=Discord" alt="Discord"></a>
</p>

<p align="center">
  <em>Cinephage</em> — from Greek <em>cine</em> (film) + <em>phage</em> (to devour). A film devourer.
</p>

---

Search for movies and TV shows, grab them from your indexers, organize your library, and fetch subtitles. One app handles it all, backed by a single database.

> [!CAUTION]
> **This project is under active development.** Features may be incomplete, APIs may change, and bugs are expected. This is a passion project by a solo developer — your patience and feedback are appreciated. Please report issues on GitHub, but understand that breaking changes may occur between updates.

<p align="center">
  <img src="docs/images/dashboard.png" alt="Cinephage Dashboard" width="800">
</p>

---

## Status

| Feature            | Status       | Notes                                                |
| ------------------ | ------------ | ---------------------------------------------------- |
| Content Discovery  | Stable       | TMDB integration, trending, search                   |
| Library Management | Stable       | File watching, scanning, TMDB matching               |
| Quality Scoring    | Stable       | 4 built-in profiles + custom profile creation        |
| Download Clients   | Stable       | qBittorrent, SABnzbd, NZBGet                         |
| Indexers           | Stable       | 9 built-in definitions + Torznab/Newznab support     |
| Subtitles          | Stable       | 8 providers, 80+ languages                           |
| Streaming          | Stable       | 10 providers with circuit breaker failover           |
| Monitoring         | Experimental | Automated searches, upgrades, new episode detection  |
| Smart Lists        | Stable       | Dynamic TMDB queries with auto-add to library        |
| Live TV/IPTV       | In Progress  | Stalker portal, EPG, channel lineup management       |

---

## Quick Start

### Docker (Recommended)

**Using Pre-built Image:**

```bash
mkdir cinephage && cd cinephage
curl -O https://raw.githubusercontent.com/MoldyTaint/cinephage/main/docker-compose.yaml
curl -O https://raw.githubusercontent.com/MoldyTaint/cinephage/main/.env.docker.example
cp .env.docker.example .env
```

Edit `.env` to configure your settings:

```bash
CINEPHAGE_PORT=3000
CINEPHAGE_MEDIA_PATH=/path/to/your/media
CINEPHAGE_UID=1000
CINEPHAGE_GID=1000
CINEPHAGE_ORIGIN=http://localhost:3000
```

Start Cinephage:

```bash
docker compose up -d
```

**Using Docker Run:**

```bash
docker run -d \
  --name cinephage \
  --restart unless-stopped \
  --user 1000:1000 \
  -p 3000:3000 \
  -v ./data:/app/data \
  -v ./logs:/app/logs \
  -v /path/to/your/media:/media \
  -e ORIGIN=http://localhost:3000 \
  -e TZ=UTC \
  ghcr.io/moldytaint/cinephage:latest
```

**Building from Source:**

```bash
git clone https://github.com/MoldyTaint/cinephage.git
cd cinephage
cp .env.docker.example .env
docker compose -f docker-compose.yaml -f docker-compose.build.yaml up -d --build
```

### Manual

```bash
git clone https://github.com/MoldyTaint/cinephage.git
cd cinephage
npm install
npm run build
npm start
```

### First-Run Setup

Open http://localhost:3000 and configure:

1. Add your TMDB API key (free at [themoviedb.org](https://www.themoviedb.org/settings/api))
2. Configure your download client (qBittorrent, SABnzbd, or NZBGet)
3. Set up root folders for movies and TV
4. Enable indexers

See [Configuration Guide](docs/getting-started/configuration.md) for detailed setup.

---

## Requirements

- **Download Client** — qBittorrent, SABnzbd, or NZBGet
- **TMDB API key** (free)
- **Node.js 20+** (manual install only)
- **ffprobe** (optional, for media info extraction)

---

## Features

- **Content Discovery** — Browse TMDB for movies and TV shows, view trending, trailers, and watch providers
- **Indexer Search** — 9 indexers built-in, plus Torznab/Newznab support for external indexers
- **Quality Scoring** — 4 built-in profiles + custom profile creation, scoring 100+ release attributes
- **Library Management** — Real-time file watching, scheduled scans, auto-match to TMDB metadata
- **Download Automation** — qBittorrent, SABnzbd, and NZBGet integration with categories and auto-import
- **Streaming** — Direct browser streaming with 10 providers and circuit breaker failover
- **Subtitles** — 8 providers, 80+ languages, auto-search on import
- **Monitoring** — Automatic searches for missing content, quality upgrades, and new episodes
- **Live TV** — IPTV/Stalker portal integration with EPG and channel management (in progress)

See [Documentation](docs/INDEX.md) for full details.

---

## Tech Stack

**Frontend:** SvelteKit 5, Svelte 5, TailwindCSS 4, DaisyUI 5
**Backend:** Node.js, SQLite, Drizzle ORM

---

## Documentation

- [Installation](docs/getting-started/installation.md)
- [Configuration](docs/getting-started/configuration.md)
- [Troubleshooting](docs/troubleshooting.md)
- [API Reference](docs/reference/api.md)
- [Roadmap](docs/roadmap.md)

---

## Development

```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run check        # TypeScript checking
npm run lint         # ESLint + Prettier
npm run test         # Run tests
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

---

## Community

- [Discord](https://discord.gg/scGCBTSWEt) — Chat and support
- [GitHub Issues](https://github.com/MoldyTaint/cinephage/issues) — Bug reports and feature requests
- [Contributing](CONTRIBUTING.md) — Development guidelines
- [Code of Conduct](CODE_OF_CONDUCT.md) — Community standards
- [Security Policy](SECURITY.md) — Vulnerability reporting

---

## Contributors

<a href="https://github.com/MoldyTaint/Cinephage/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=MoldyTaint/Cinephage" />
</a>

---

## Acknowledgments

Cinephage draws inspiration from the architecture of [Radarr](https://github.com/Radarr/Radarr), [Sonarr](https://github.com/Sonarr/Sonarr), [Prowlarr](https://github.com/Prowlarr/Prowlarr), and [Bazarr](https://github.com/morpheus65535/bazarr), with modern UI patterns influenced by [Overseerr](https://github.com/sct/overseerr). Thanks to [Dictionarry](https://github.com/Dictionarry-Hub/database) for quality scoring data, [EncDec Endpoints](https://github.com/AzartX47/EncDecEndpoints) for streaming functionality, and [FlareSolverr](https://github.com/FlareSolverr/FlareSolverr) for Cloudflare handling. Uses [TMDB](https://www.themoviedb.org/) for metadata. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for complete attribution.

## AI Disclosure

This project was built with and continues to use AI assistance. As a solo developer who's still learning, AI makes it possible to tackle a project of this scope — something that would otherwise require a team. It's a personal project, and AI is a tool that helps bridge the gap between ambition and experience. It's not perfect, but neither am I. We believe in being upfront about how this project is built.

## License

[GNU General Public License v3.0](LICENSE)

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
