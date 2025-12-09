# Indexers

Cinephage includes built-in support for torrent indexers using Cardigann-compatible YAML definitions. No external tools like Jackett or Prowlarr are required for basic functionality.

## Built-in Indexers

20+ indexer definitions included:

### Public Indexers

| Indexer | Content | Notes |
|---------|---------|-------|
| YTS | Movies | 1080p and 2160p, small files |
| EZTV | TV | Large TV library |
| 1337x | General | Movies, TV, general |
| TorrentGalaxy | General | Movies, TV, games |
| Nyaa | Anime | Japanese content focus |
| SubsPlease | Anime | Simulcast releases |
| Anidex | Anime | Multi-language anime |
| Solidtorrents | General | DHT-based aggregator |
| LimeTorrents | General | Movies, TV, general |
| MagnetDL | General | Magnet link focus |
| BitSearch | General | Search aggregator |
| BTDig | General | DHT search engine |
| TheRARBG | General | RARBG mirror |
| Knaben | General | Multi-tracker aggregator |
| TorrentsCSV | General | DHT database search |

### Private Trackers

Private tracker support includes:

- Aither
- BeyondHD
- IPTorrents
- OldToonsWorld
- SceneTime
- SpeedCD
- TorrentDay

---

## Enabling Indexers

1. Navigate to Settings > Integrations > Indexers
2. Browse available indexers
3. Toggle indexers on/off as needed
4. Configure any required settings (API keys, credentials for private trackers)
5. Test each indexer to verify connectivity

---

## Torznab Integration

Connect to external indexer managers using the Torznab protocol. This allows using indexers already configured in Prowlarr or Jackett.

### Adding a Torznab Indexer

1. Navigate to Settings > Integrations > Indexers
2. Click "Add Indexer" and select "Torznab"
3. Enter connection details:
   - **Name**: Display name for the indexer
   - **URL**: Base URL of your Prowlarr/Jackett instance
   - **API Key**: API key from your indexer manager
4. Test the connection
5. Save

### Example URLs

- Prowlarr: `http://localhost:9696/1/api` (where `1` is the indexer ID)
- Jackett: `http://localhost:9117/api/v2.0/indexers/INDEXER_NAME/results/torznab`

---

## Custom Indexers

Create custom indexer definitions using Cardigann-compatible YAML.

### Creating a Custom Indexer

1. Create a YAML file in `data/indexers/definitions/`
2. Follow the Cardigann definition format
3. Restart Cinephage to load the new indexer

### Example Definition

```yaml
id: example-indexer
name: Example Indexer
description: An example indexer definition
language: en-US
type: public

caps:
  categories:
    Movies: 2000
    TV: 5000

search:
  paths:
    - path: search
      method: get
  inputs:
    query: "{{ .Query.Q }}"

download:
  selectors:
    - selector: a.download-link
      attribute: href
```

### Definition Structure

| Section | Purpose |
|---------|---------|
| `id` | Unique identifier |
| `name` | Display name |
| `description` | Brief description |
| `language` | Primary language code |
| `type` | `public` or `private` |
| `caps` | Supported categories and search modes |
| `search` | Search request configuration |
| `download` | Download link extraction |
| `login` | Authentication (private trackers) |

See existing definitions in `data/indexers/definitions/` for complete examples.

---

## Indexer Settings

### Rate Limiting

Each indexer has configurable rate limits to prevent being blocked:

- **Requests per minute**: Maximum API calls per minute
- **Cooldown**: Time to wait after rate limit is hit

### Auto-Disable

Indexers that repeatedly fail are automatically disabled with exponential backoff:

1. First failure: 5 minute cooldown
2. Second failure: 15 minute cooldown
3. Third failure: 1 hour cooldown
4. Continued failures: Progressive increase up to 24 hours

Manually re-enable indexers in Settings after resolving issues.

### Health Monitoring

Monitor indexer health in Settings > Integrations > Indexers:

- **Status**: Current state (enabled, disabled, rate-limited)
- **Last Success**: Time of last successful search
- **Failure Count**: Number of consecutive failures
- **Response Time**: Average response time
