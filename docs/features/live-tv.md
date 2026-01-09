# Live TV

Cinephage includes experimental IPTV support with Stalker portal integration, portal scanning, EPG management, and channel lineup organization.

> **Experimental Feature**: Live TV functionality is under active development. Expect bugs and incomplete features. Report issues on [GitHub](https://github.com/MoldyTaint/Cinephage/issues).

---

## Overview

Cinephage supports live TV through Stalker/Ministra portal integration. You have two options:

- **Bring your own account** — If you already have a Stalker portal account from an IPTV provider, add it directly with your portal URL and MAC address
- **Discover accounts** — Use the built-in portal scanner to discover working accounts by scanning MAC addresses against portals

Once you have an account set up, you get:

- Channel sync from the portal
- Electronic Program Guide (EPG) support
- Channel lineup organization
- M3U playlist generation for external players
- Category management

---

## Adding Your Own Account

If you already have an IPTV subscription with a Stalker portal provider, you can add your account directly.

### What Are Stalker Portals?

Stalker (also known as Ministra) is an IPTV middleware system used by many IPTV providers to deliver live TV streams. Your provider gives you a portal URL and MAC address to access their service.

### Adding Your Account

1. Navigate to **Live TV > Accounts**
2. Click **Add Account**
3. Enter your provider's details:

| Setting         | Description                           |
| --------------- | ------------------------------------- |
| **Name**        | Display name for this account         |
| **Portal URL**  | Portal URL from your IPTV provider    |
| **MAC Address** | MAC address assigned by your provider |

4. Click **Test** to verify the connection
5. Save the account

### After Adding

Once your account is added, click **Sync Channels** to fetch the channel list from your provider. Cinephage will import all available channels and categories.

---

## Discovering Accounts

If you don't have an existing IPTV account, Cinephage can discover working accounts on Stalker portals by scanning MAC addresses.

### How It Works

The scanner tests MAC addresses against a portal to find valid credentials. When a valid MAC is found, the scanner retrieves account details including channel count, categories, and expiration date.

### Scan Types

| Type           | Description                                                                            |
| -------------- | -------------------------------------------------------------------------------------- |
| **Random**     | Generates random MAC addresses using known STB manufacturer prefixes (MAG boxes, etc.) |
| **Sequential** | Tests a specific range of MAC addresses in order                                       |
| **Import**     | Tests a list of MAC addresses you provide                                              |

### Scanning Process

1. Navigate to **Live TV > Scanner**
2. Select or create a portal to scan
3. Choose scan type and configure options:
   - **Random**: Select MAC prefix and number of addresses to test
   - **Sequential**: Define start and end MAC addresses
   - **Import**: Paste a list of MAC addresses to test
4. Start the scan - progress displays in real-time
5. Review discovered accounts (shows channel count, expiry, status)
6. Approve accounts you want to use
7. Approved accounts sync channels automatically

### Scan Results

Discovered accounts show:

- MAC address
- Channel count
- Category count
- Account expiration date
- Account status (active, expired, etc.)

You can approve individual accounts or bulk approve multiple results. Ignored results are hidden from the list.

---

## Channel Sync

After adding an account, sync channels:

1. Go to your account settings
2. Click **Sync Channels**
3. Cinephage fetches the channel list from the portal
4. Channels appear in the channel management interface

### What Gets Synced

- Channel names
- Channel numbers
- Categories/groups
- Stream URLs
- Channel logos (if available)

---

## Channel Lineup

The channel lineup determines which channels are active and how they're organized.

### Managing Channels

1. Navigate to **Live TV > Channels**
2. View all synced channels
3. Toggle channels on/off
4. Reorder channels
5. Assign to categories

### Creating a Lineup

1. Go to **Live TV > Lineup**
2. Click **Create Lineup**
3. Select channels to include
4. Arrange order
5. Save

### Multiple Lineups

Create different lineups for different purposes:

- **All Channels**: Everything available
- **Sports Only**: Just sports channels
- **News**: News channels only
- **Family**: Family-friendly content

---

## Categories

Organize channels into categories:

### Default Categories

- Movies
- Sports
- News
- Entertainment
- Kids
- Music

### Custom Categories

1. Go to **Live TV > Categories**
2. Click **Add Category**
3. Name the category
4. Assign channels

---

## Electronic Program Guide (EPG)

EPG provides TV schedule information.

### EPG Sources

Cinephage can import EPG data from:

- Portal-provided EPG
- External XMLTV URLs

### Configuring EPG

1. Go to **Live TV > EPG**
2. Add EPG source URL
3. Configure refresh interval
4. Map EPG channels to your lineup

### EPG Refresh

- Default interval: 6 hours
- Manual refresh available
- EPG data cached locally

---

## M3U Playlist

Cinephage generates M3U playlists for external players.

### Accessing the Playlist

The M3U playlist is available at:

```
http://your-cinephage-url/api/livetv/playlist.m3u
```

### Using with External Apps

Point any M3U-compatible player to this URL:

- VLC
- IPTV apps
- Smart TV apps
- Kodi

### Playlist Contents

The M3U includes:

- Active channels from your lineup
- Stream URLs
- Channel names and numbers
- EPG mapping (if configured)

---

## Stream Playback

### Direct Play

Click any channel in the Live TV interface to play directly.

### Via Media Server

Import the M3U playlist into Jellyfin/Emby/Plex for integrated live TV.

---

## Known Limitations

This feature is experimental:

- Not all Stalker portals are supported
- Some streams may not play correctly
- EPG mapping can be imperfect
- Category sync may be incomplete
- DVR/recording not supported yet

---

## Troubleshooting

### Channels Not Loading

1. Verify portal URL is correct
2. Check MAC address is valid
3. Ensure portal is online
4. Check Cinephage logs for errors

### Streams Not Playing

- Some streams require specific player support
- Check if stream format is compatible
- Try playing in VLC directly

### EPG Not Showing

1. Verify EPG source URL is accessible
2. Check channel-to-EPG mapping
3. Wait for next EPG refresh
4. Check EPG source format is XMLTV compatible

---

**See also:** [Streaming](streaming.md) | [Notifications](notifications.md) | [Troubleshooting](../support/troubleshooting.md)
