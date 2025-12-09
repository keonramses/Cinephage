# Quality Profiles

Cinephage uses a scoring system to evaluate and compare torrent releases, helping you get the best quality for your preferences.

## Built-in Profiles

Four profiles cover common use cases:

| Profile | Focus | Use Case |
|---------|-------|----------|
| **Best** | Maximum quality | Remux, lossless audio, quality purists |
| **Efficient** | Quality with efficient encoding | x265/HEVC from quality groups |
| **Micro** | Quality-focused micro encodes | Small files, good quality |
| **Streaming** | Instant availability | Stream providers, auto-upgradeable |

### Best Profile

- Prioritizes highest quality regardless of file size
- Prefers Remux, then BluRay encodes
- Values lossless audio (TrueHD, DTS-HD MA)
- Prefers HDR formats (Dolby Vision, HDR10+)
- Uses top-tier release groups

### Efficient Profile

- Balances quality with file size
- Prefers x265/HEVC encoding
- Accepts lossy but high-quality audio (DTS, Atmos)
- Values efficient encoding from quality groups
- Good for limited storage with quality priority

### Micro Profile

- Quality-focused with smaller file sizes
- Prefers top micro-encode groups (Tigole, QxR)
- Accepts standard audio codecs
- Good balance for moderate storage

### Streaming Profile

- Instant availability via stream providers
- Auto-upgradeable to torrent when available
- Multiple streaming sources
- Mobile and quick-access scenarios

---

## Scoring System

Releases are scored based on multiple factors. Higher scores indicate better quality.

### Resolution + Source (0-20000 points)

| Quality | Score |
|---------|-------|
| 2160p Remux | 20000 |
| 2160p BluRay | 18000 |
| 2160p Web-DL | 15000 |
| 1080p Remux | 14000 |
| 1080p BluRay | 12000 |
| 1080p Web-DL | 10000 |
| 720p BluRay | 7000 |
| 720p Web-DL | 5000 |

### Audio Codec (0-2000 points)

| Codec | Score |
|-------|-------|
| TrueHD Atmos | 2000 |
| DTS-HD MA | 1800 |
| TrueHD | 1600 |
| DTS-X | 1500 |
| Atmos | 1400 |
| DTS-HD | 1200 |
| DTS | 800 |
| AAC | 400 |

### HDR Format (0-1000 points)

| Format | Score |
|--------|-------|
| Dolby Vision | 1000 |
| HDR10+ | 800 |
| HDR10 | 600 |

### Release Group Tiers (0-500 points)

| Tier | Examples | Score |
|------|----------|-------|
| Tier 1 | FraMeSToR, etc. | 500 |
| Tier 2 | SPARKS, etc. | 300 |
| Tier 3 | RARBG, etc. | 100 |
| Unknown | - | 0 |

### Penalties

| Condition | Score |
|-----------|-------|
| Banned groups | -10000 |
| Cam/Screener | -5000 |
| Low quality audio | -500 |
| Streaming rips | -200 |

---

## Custom Profiles

You can create custom quality profiles in Settings > Profiles:

1. Navigate to Settings > Profiles
2. Click "Add Profile"
3. Configure scoring weights for each attribute
4. Set minimum and cutoff quality levels
5. Assign the profile to movies or series

Custom profiles allow you to:

- Adjust scoring weights for resolution, audio, HDR
- Set minimum acceptable quality thresholds
- Define upgrade cutoffs (stop upgrading after reaching a quality level)
- Whitelist or blacklist specific release groups
