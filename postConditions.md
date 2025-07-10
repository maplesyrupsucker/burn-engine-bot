# VERSE Burn Engine Bot - Post Conditions Documentation

## Overview
This document outlines all posting conditions and behaviors for the VERSE Burn Engine Bot across different social media platforms following the recent update that prevents auto-posting to Telegram when the Burn Engine balance is 0 VERSE.

---

## Platform-Specific Post Conditions

### 🐦 Twitter (X)
**Status:** Always Posts (with rate limiting)

#### Posting Triggers:
- ✅ **Burn Engine Deposits**: Always posts when VERSE is deposited to burn engine
- ✅ **Periodic Status Updates**: Posts every 12 hours regardless of balance
- ✅ **Actual Burns**: Always posts immediately when VERSE is burned (force post = true)
- ✅ **Buybacks**: Always posts immediately when enabled (force post = true)

#### Rate Limiting:
- Standard posts: Once per week maximum
- Force posts (burns/buybacks): No rate limiting
- All posts respect Twitter API limits

---

### 📱 Telegram 
**Status:** Conditional Auto-Posting + Manual Commands

#### Auto-Post Conditions (ALL must be true):
1. ✅ **Time Gate**: More than 7 days since last Telegram notification
2. ✅ **Balance Changed**: Current balance differs from last reported balance  
3. ✅ **Non-Zero Balance**: Current Burn Engine balance > 0 VERSE
4. ✅ **Daily Limit**: Less than 2 auto-posts today *(NEW CONDITION)*

#### Always Posts (No Conditions):
- ✅ **Actual Burns**: Immediate posting when VERSE tokens are burned
- ✅ **Buybacks**: Immediate posting when buybacks occur (if enabled)

#### Manual Commands (Rate Limited):
- `/burns` - Show last 5 burns
- `/enginebalance` - Show current burn engine balance  
- `/totalverseburned` - Show total burned statistics
- `/help` - Show command help

#### Rate Limits:
- **Per User**: 3 commands per minute
- **Global**: 3 commands per minute across all users
- **Heavy Commands**: 15-minute cooldown for data-intensive commands
- **Cooldown**: 5-minute timeout for rate-limited users
- **Auto-Posts**: Maximum 2 per day when balance > 0

---

### 🎮 Discord
**Status:** Limited Integration

#### Posting Triggers:
- ✅ **Actual Burns**: Always posts to #general and #verse channels
- ❌ **Burn Engine Deposits**: No auto-posting
- ❌ **Status Updates**: No auto-posting  
- ❌ **Buybacks**: No auto-posting

#### Configuration:
- Posts to: `#general` and `#verse` channels
- No rate limiting implemented
- No manual commands available

---

### 💼 Slack
**Status:** Limited Integration

#### Posting Triggers:
- ✅ **Actual Burns**: Always posts to #verse-burns channel
- ❌ **Burn Engine Deposits**: No auto-posting
- ❌ **Status Updates**: No auto-posting
- ❌ **Buybacks**: No auto-posting

#### Configuration:
- Posts to: `#verse-burns` channel only
- No rate limiting implemented  
- No manual commands available

---

### 📘 Facebook
**Status:** Limited Integration

#### Posting Triggers:
- ✅ **Actual Burns**: Always posts to configured page
- ❌ **Burn Engine Deposits**: No auto-posting
- ❌ **Status Updates**: No auto-posting
- ❌ **Buybacks**: No auto-posting

#### Configuration:
- Posts to: Configured Facebook page
- No rate limiting implemented
- No manual commands available

---

## Event Types and Behaviors

### 🔥 Actual VERSE Burns (High Priority)
When VERSE tokens are sent to null address (0x000...):
- **Twitter**: ✅ Force post (ignores rate limits)
- **Telegram**: ✅ Always posts immediately  
- **Discord**: ✅ Posts to both channels
- **Slack**: ✅ Posts to #verse-burns
- **Facebook**: ✅ Posts to page

### 🚀 Burn Engine Deposits (Medium Priority)  
When VERSE is deposited to burn engine:
- **Twitter**: ✅ Posts with weekly rate limit
- **Telegram**: ✅ Posts only if balance > 0 AND other conditions met (max 2/day)
- **Discord**: ❌ No posting
- **Slack**: ❌ No posting  
- **Facebook**: ❌ No posting

### 📊 Periodic Status Updates (Low Priority)
Every 12 hours:
- **Twitter**: ✅ Posts with weekly rate limit
- **Telegram**: ✅ Posts only if balance > 0 AND other conditions met (max 2/day)
- **Discord**: ❌ No posting
- **Slack**: ❌ No posting
- **Facebook**: ❌ No posting

### 💸 Buybacks (Variable Priority)
When ETH buybacks occur (if enabled):
- **Twitter**: ✅ Force post if `ENABLE_BUYBACK_TRACKING=true`
- **Telegram**: ✅ Always posts if enabled
- **Discord**: ❌ No posting
- **Slack**: ❌ No posting
- **Facebook**: ❌ No posting

---

## Configuration Settings

### Feature Flags
- `ENABLE_BUYBACK_TRACKING`: Currently `false` - controls buyback posting
- `TELEGRAM_RATE_LIMIT`: Configurable rate limiting parameters
- `STATUS_UPDATE_INTERVAL`: 12 hours (43,200,000 ms)
- `POLLING_INTERVAL`: 15 minutes (900,000 ms)

### Balance Thresholds
- **Zero Balance Threshold**: Exactly 0 VERSE prevents Telegram auto-posting
- **Minimum Balance for Auto-Post**: > 0 VERSE required for Telegram
- **Daily Auto-Post Limit**: Maximum 2 Telegram auto-posts per 24 hours

### Time Gates  
- **Telegram Auto-Post**: 7 days minimum between notifications
- **Twitter Rate Limit**: 7 days minimum between standard posts
- **Status Updates**: Every 12 hours
- **Daily Reset**: Auto-post counter resets every 24 hours

---

## Recent Changes (Latest Update)

### ✅ Fixed: Zero Balance Auto-Posting + Enhanced Rate Limiting
**Problem**: Bot was auto-posting to Telegram when Burn Engine balance was 0 VERSE and rate limits were too lenient
**Solution**: Added multiple improvements for better control

**Changes Made:**
1. **Zero Balance Prevention**: Added balance check `(balanceEth > 0)` to auto-posting conditions
2. **Daily Auto-Post Limit**: Maximum 2 Telegram auto-posts per 24 hours when balance > 0
3. **Stricter Rate Limits**: Reduced command limits and increased cooldowns

**Affected Functions:**
- `handleTransfer()` - Burns engine deposits
- `periodicStatusUpdate()` - Scheduled status updates
- `constants.js` - Updated rate limiting configuration

**Rate Limit Updates:**
- Per-user commands: 5 → 3 per minute
- Global commands: 20 → 3 per minute across all users  
- Heavy command cooldown: 5 → 15 minutes
- Rate limited user cooldown: 1 → 5 minutes
- New: Auto-post daily limit of 2 posts

**Impact**: 
- Telegram will no longer receive auto-posts when balance is 0
- Maximum 2 auto-posts per day when balance > 0
- More conservative rate limiting prevents spam
- Manual commands still work regardless of balance
- Actual burns still post immediately regardless of engine balance
- Twitter posting behavior unchanged

---

## Error Handling & Notifications

### Error Notifications
- Sent via Telegram DM to admin (`MY_TELEGRAM_ID`)
- Includes specific error messages and context
- Rate limited to prevent spam

### Failed Posts
- Errors logged to console
- Does not prevent other platform posts
- Admin notified via Telegram DM

### Rate Limit Handling
- Exponential backoff for API errors
- User-friendly rate limit messages
- Separate tracking for users and global limits

---

## Monitoring & Maintenance

### Health Checks
- Monitor error logs for posting failures
- Check rate limit hit rates via console logs
- Verify Telegram auto-posting behavior with balance changes

### Recommended Monitoring
1. **Daily**: Check error notification count
2. **Weekly**: Verify posting frequency across platforms
3. **Monthly**: Review rate limit statistics
4. **After Updates**: Test posting conditions manually

### Manual Testing Commands
```bash
# Test Telegram commands (respects new 3/minute limit)
/enginebalance
/burns  
/totalverseburned
/help

# Check logs for rate limiting
grep "rate limit" logs/

# Verify balance checks
grep "Don't auto-post when balance is 0" logs/

# Monitor daily auto-post limit
grep "Daily limit check" logs/
grep "dailyAutoPostCount" logs/
```

---

## Support & Troubleshooting

### Common Issues
1. **No Telegram Auto-Posts**: Check if balance > 0, 7+ days since last post, AND under daily limit (2/day)
2. **Rate Limit Errors**: Wait for cooldown period (5-15 minutes depending on command type)
3. **Missing Platform Posts**: Check platform-specific API credentials
4. **Auto-Posts Stopped Mid-Day**: Daily limit of 2 posts may have been reached

### Contact
- Review bot logs for detailed error information
- Check environment variables for platform credentials
- Verify webhook/API connectivity for each platform

---

*Last Updated: [Current Date] - Added zero balance prevention for Telegram auto-posting* 