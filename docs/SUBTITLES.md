# Subtitle System

Cinephage includes comprehensive subtitle management with 8 built-in providers and support for 150+ languages.

## Providers

| Provider | Type | Features |
|----------|------|----------|
| OpenSubtitles | API | Hash matching, largest database |
| Podnapisi | Scraper | Good coverage, hearing impaired |
| Subscene | Scraper | Large community database |
| Addic7ed | Scraper | TV focus, multiple languages |
| SubDL | API | Modern API, good quality |
| YIFY Subtitles | Scraper | YTS movie focus |
| Gestdown | API | Addic7ed alternative |
| Subf2m | Scraper | Wide coverage |

### Provider Details

**OpenSubtitles**

- Largest subtitle database
- Hash-based matching for accuracy
- Requires free account and API key
- Rate limited (20 requests/day on free tier)

**Podnapisi**

- No account required
- Good for European languages
- Hearing impaired subtitle support
- Reliable uptime

**Subscene**

- Large community-contributed database
- Manual subtitle verification
- Multiple languages per release
- May require CAPTCHA solving

**Addic7ed**

- TV show focus
- Multiple translations per episode
- Release group matching
- Account recommended for best experience

**SubDL**

- Modern REST API
- Good quality control
- No account required
- Fast response times

**YIFY Subtitles**

- Optimized for YTS/YIFY releases
- Movie-focused
- Compact files
- Good coverage for popular films

**Gestdown**

- Alternative source for Addic7ed content
- API-based access
- No account required

**Subf2m**

- Wide language coverage
- Community-driven
- Supports both movies and TV

---

## Configuration

### Enabling Providers

1. Navigate to Settings > Integrations > Subtitle Providers
2. Toggle providers on/off
3. Configure API keys where required:
   - OpenSubtitles: Requires API key
   - SubDL: Optional API key for higher limits
4. Set provider priority order (drag to reorder)

### Provider Priority

When searching for subtitles, Cinephage queries providers in priority order:

1. Searches top-priority provider first
2. If no match found, moves to next provider
3. Continues until match found or all providers exhausted

Reorder providers based on your preference and success rates.

---

## Language Profiles

Language profiles define which subtitle languages to search for and in what order.

### Creating a Profile

1. Navigate to Settings > Integrations > Language Profiles
2. Click "Add Profile"
3. Add languages in priority order
4. Configure options:
   - Hearing impaired preference
   - Foreign parts only (for forced subtitles)
5. Save the profile

### Example Profile

A typical English speaker might configure:

1. English (primary)
2. English (Hearing Impaired)
3. Spanish (backup)

### Assigning Profiles

Assign language profiles to:

- All content (default profile)
- Specific movies
- Specific series
- Individual episodes (for foreign language episodes)

---

## Automatic Search

Enable automatic subtitle search when media is imported.

### How It Works

1. Media file is imported to library
2. Cinephage identifies the movie or episode
3. Searches configured providers using language profile
4. Downloads best matching subtitle
5. Saves alongside media file

### Configuration

Enable in Settings > General > Subtitles:

- **Auto-search on import**: Enable/disable
- **Overwrite existing**: Replace existing subtitles
- **Minimum score**: Only download if match confidence is high enough

---

## Manual Search

Search for subtitles manually from media detail pages:

1. Navigate to the movie or episode
2. Click "Search Subtitles"
3. Review results from all providers
4. Select and download preferred subtitle

Results show:

- Provider source
- Language
- Release name match
- Hearing impaired indicator
- Download count (where available)

---

## Supported Languages

150+ languages including regional variants:

### Major Languages

- English, Spanish, French, German, Portuguese, Italian
- Dutch, Polish, Russian, Turkish, Arabic
- Japanese, Korean, Chinese (Simplified & Traditional)
- Hindi, Thai, Vietnamese, Indonesian

### Regional Variants

- Portuguese (Brazil)
- Chinese (Traditional)
- Spanish (Latin America)
- French (Canada)

### Language Codes

Cinephage supports both:

- ISO 639-1 (2-letter codes): en, es, fr
- ISO 639-2 (3-letter codes): eng, spa, fra

---

## Subtitle Management

### File Naming

Subtitles are saved alongside media files:

```
Movie.Name.2023.1080p.BluRay.mkv
Movie.Name.2023.1080p.BluRay.en.srt        # English
Movie.Name.2023.1080p.BluRay.es.srt        # Spanish
Movie.Name.2023.1080p.BluRay.en.hi.srt     # English (Hearing Impaired)
```

### History

View subtitle download history:

- Downloaded subtitles per media item
- Provider used
- Download date
- Manual vs automatic

### Blacklist

Blacklist poor quality subtitles:

1. From subtitle history, click "Blacklist"
2. Subtitle won't be downloaded again
3. Future searches skip blacklisted items

---

## Rate Limiting

Each provider has built-in rate limiting:

| Provider | Limit |
|----------|-------|
| OpenSubtitles | 20/day (free), 200/day (VIP) |
| Podnapisi | 60/minute |
| Subscene | 30/minute |
| Addic7ed | 40/day |
| SubDL | 100/hour |
| Others | Provider-specific |

Cinephage automatically respects these limits and queues requests when needed.
