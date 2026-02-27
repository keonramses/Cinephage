# SSE Manual Testing Checklist

This document provides a comprehensive checklist for manually testing the SSE (Server-Sent Events) functionality across the application.

## Prerequisites

1. Application must be running (`npm run dev`)
2. Browser DevTools open to Network tab (filter by "events")
3. Multiple browser tabs may be needed for some tests

## Connection Lifecycle Tests

### Test 1: Basic Connection

- [ ] Navigate to **Tasks** page (`/settings/tasks`)
- [ ] Check that SSE connection is established
- [ ] Verify Network tab shows `/api/tasks/stream` connection
- [ ] Check that status badge shows "Connected" or "Live"

### Test 2: Reconnection on Error

- [ ] Navigate to **Tasks** page
- [ ] Wait for connection to establish
- [ ] Disconnect network (turn off WiFi or use DevTools offline mode)
- [ ] Verify status shows "Disconnected"
- [ ] Reconnect network
- [ ] Verify status shows "Reconnecting..." then "Connected"
- [ ] Check that missed events were not lost (if any occurred during disconnect)

### Test 3: Tab Visibility

- [ ] Navigate to **LiveTV Channels** page (`/livetv/channels`)
- [ ] Verify connection is active
- [ ] Switch to another tab (hide the LiveTV tab)
- [ ] Check Network tab - connection should pause (no heartbeat events)
- [ ] Switch back to LiveTV tab
- [ ] Verify connection resumes and shows "Connected"

### Test 4: Max Retries

- [ ] Navigate to any page with SSE
- [ ] Disconnect network
- [ ] Wait for multiple retry attempts (should see exponential backoff)
- [ ] After max retries (check config), verify status shows "Error" or "Failed"
- [ ] Reconnect network
- [ ] Verify manual reconnect button works

## Event Reception Tests

### Test 5: Task Events

- [ ] Navigate to **Tasks** page
- [ ] Trigger a task manually (e.g., "Rss Sync")
- [ ] Verify "task:started" event received
- [ ] Verify UI updates to show task is running
- [ ] Wait for task to complete
- [ ] Verify "task:completed" event received
- [ ] Verify UI updates with results

### Test 6: Activity Events

- [ ] Navigate to **Activity** page (`/activity`)
- [ ] Start a download (or trigger monitoring search)
- [ ] Verify "activity:new" event received
- [ ] Wait for download progress
- [ ] Verify "activity:progress" events received
- [ ] Wait for import completion
- [ ] Verify "activity:updated" event received

### Test 7: LiveTV Channel Events

- [ ] Navigate to **LiveTV Channels** page
- [ ] Trigger channel sync from **Accounts** page
- [ ] Switch back to Channels page
- [ ] Verify "channels:syncStarted" event received
- [ ] Wait for sync to complete
- [ ] Verify "channels:syncCompleted" event received
- [ ] Verify channel lineup updates in UI

### Test 8: LiveTV EPG Events

- [ ] Navigate to **LiveTV EPG** page (`/livetv/epg`)
- [ ] Trigger EPG sync
- [ ] Verify "epg:syncStarted" event received
- [ ] Wait for sync to complete
- [ ] Verify "epg:syncCompleted" event received
- [ ] Verify EPG data updates in UI

## Multi-Tab Tests

### Test 9: Shared Connection

- [ ] Open **Tasks** page in Tab 1
- [ ] Open **Tasks** page in Tab 2 (same URL)
- [ ] Verify only one SSE connection in Network tab (shared connection)
- [ ] Trigger a task
- [ ] Verify both tabs receive events
- [ ] Close Tab 1
- [ ] Verify connection remains open in Tab 2
- [ ] Close Tab 2
- [ ] Verify connection closes

### Test 10: Different Pages

- [ ] Open **Tasks** page in Tab 1
- [ ] Open **Activity** page in Tab 2
- [ ] Verify two separate SSE connections in Network tab
- [ ] Trigger events on both
- [ ] Verify each page only receives its own events

## Error Handling Tests

### Test 11: Circuit Breaker

- [ ] Configure circuit breaker threshold to 2 (for testing)
- [ ] Navigate to page with SSE
- [ ] Force 2 errors (e.g., stop server, restart, causing 500 errors)
- [ ] Verify circuit opens (status shows cooling down)
- [ ] Wait for circuit timeout
- [ ] Verify circuit closes and reconnection attempts resume

### Test 12: Server Unavailable

- [ ] Navigate to page with SSE
- [ ] Stop the server
- [ ] Verify connection fails with appropriate error message
- [ ] Start server again
- [ ] Verify automatic reconnection

### Test 13: Invalid Events

- [ ] Manually send malformed SSE event (requires server modification)
- [ ] Verify client handles error gracefully
- [ ] Verify connection remains open
- [ ] Verify subsequent valid events are still received

## Performance Tests

### Test 14: Rapid Events

- [ ] Navigate to **Activity** page
- [ ] Trigger multiple rapid downloads
- [ ] Verify UI remains responsive
- [ ] Check DevTools Performance tab for memory leaks

### Test 15: Long-Running Connection

- [ ] Navigate to page with SSE
- [ ] Keep page open for 30+ minutes
- [ ] Verify connection stays alive (heartbeat working)
- [ ] Verify memory usage doesn't grow continuously

## Cleanup Tests

### Test 16: Page Navigation

- [ ] Navigate to **Tasks** page
- [ ] Wait for connection to establish
- [ ] Navigate to **Activity** page
- [ ] Verify Tasks SSE connection closes
- [ ] Verify Activity SSE connection opens
- [ ] Navigate back to Tasks
- [ ] Verify new Tasks connection opens

### Test 17: Browser Close

- [ ] Open **Tasks** page
- [ ] Verify connection established
- [ ] Close browser tab
- [ ] Check server logs - should show disconnect cleanup

## Browser Compatibility

### Test 18: Different Browsers

- [ ] Test in Chrome
- [ ] Test in Firefox
- [ ] Test in Safari (if available)
- [ ] Verify all tests pass in each browser

## Mobile Testing

### Test 19: Mobile Browser

- [ ] Open application on mobile browser
- [ ] Navigate to page with SSE
- [ ] Verify connection works
- [ ] Background the app
- [ ] Foreground the app
- [ ] Verify connection resumes

## Regression Tests

### Test 20: After Refactoring

- [ ] Run all above tests after any SSE code changes
- [ ] Verify no regressions introduced
- [ ] Document any changes in behavior

## Notes

- Use browser DevTools Network tab to monitor SSE connections
- Look for `EventStream` type in Network tab
- Check Console for any SSE-related errors or warnings
- Some tests may require modifying server code to simulate errors
- Consider automating these tests with Playwright for CI/CD

## Troubleshooting

**Connection not establishing:**

- Check server is running
- Check browser console for errors
- Verify URL is correct

**Events not received:**

- Check Network tab for event stream
- Verify event names match exactly
- Check for any client-side filtering

**Memory leaks:**

- Use Chrome DevTools Memory tab
- Take heap snapshots before and after
- Compare to identify leaks
