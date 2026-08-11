# SquadJS Switch Plugin

**Team-change management with database persistence and TeamBalancer integration.**

## Overview

Manages player team-change requests with cooldown enforcement and admin restrictions. Survives server restarts via any Sequelize-compatible database (SQLite, MySQL, PostgreSQL, etc.). Responds to team scrambles by locking all players from switching.

## Features

* **Persistent cooldowns** — stored in configured database, survive restarts
* **Multi-database support** — works with SQLite, MySQL, PostgreSQL, and any Sequelize-compatible backend
* **Scramble lockout** — blocks all players from switching for configurable duration after scramble
* **Liberal mode** — relaxed cooldown/time limits on Seed/Jensen layers for low-population flexibility
* **Dynamic balance tolerance** — interpolated extra switch slots that scale down as player count rises
* **50v50 ceiling** — prevents any team from exceeding 50 players via switch
* **Match-end switch queue** — queue individual players or entire squads for automatic switch at round end
* **Double switch** — `!bug` / `!stuck` commands swap a player to the opposite team and back (fixes stuck/bugged states without changing teams)
* **Squad-level operations** — switch, double-switch, or queue entire squads in one command
* **Pre-disconnection team rejoining** — optionally auto-switch players back to their old team on reconnect
* **Admin controls** — in-game chat and Discord

## Commands

### User (In-Game)

| Command | Description |
|---|---|
| `!switch` | Request a team change (checks balance, cooldowns, scramble locks) |
| `!switch help` | In-game warning popup explaining eligibility rules |

### Admin (In-Game)

| Command | Description |
|---|---|
| `!switch now <Name/EOSID>` | Force-switch a player immediately |
| `!switch double <Name/EOSID>` | Double-switch a player (swap to opposite team and back) |
| `!switch squad <squadID> <teamID>` | Switch an entire squad to the specified team |
| `!switch doublesquad <squadID> <teamID>` | Double-switch an entire squad |
| `!switch matchend <Name/EOSID>` | Queue a player for automatic switch at match end |
| `!switch matchendsquad <squadID> <teamID>` | Queue a squad for automatic switch at match end |
| `!switch triggermatchend` | Manually trigger the match-end switch sequence |
| `!switch check <Name/EOSID>` | Real-time eligibility lookup for a player |
| `!switch clear <Name/EOSID>` | Remove cooldowns/locks for a player |
| `!switch clearall` | Wipe the entire cooldown database |
| `!switch refresh` | Refresh player and squad lists from RCON |
| `!switch slots` | Show available switch slots per team |
| `!switch help` | List all admin commands |

### Discord

| Command | Description |
|---|---|
| `!switch diag` | System diagnostics — database health, RCON latency, top 10 locked players |
| `!switch check <Name/EOSID>` | Real-time eligibility lookup for a player |

## Configuration

```json
{
    "plugin": "Switch",
    "enabled": true,
    "commandPrefix": ["!switch", "!change"],
    "discordClient": "discord",
    "discordChannelID": "YOUR_ADMIN_CHANNEL_ID",
    "database": "sqlite",
    "switchCooldownHours": 3,
    "switchCooldownMinutes": 0,
    "switchEnabledMinutes": 5,
    "doubleSwitchCommands": ["!bug", "!stuck", "!doubleswitch"],
    "doubleSwitchCooldownHours": 0.5,
    "doubleSwitchDelaySeconds": 1,
    "doubleSwitchEnabledMinutes": 5,
    "endMatchSwitchSlots": 3,
    "maxUnbalancedSlots": 5,
    "switchToOldTeamAfterRejoin": false,
    "scrambleLockdownDurationMinutes": 20,
    "liberalSwitchGameModes": ["Seed", "Jensen"],
    "liberalSwitchMaxUnbalancedSlots": 6,
    "dynamicBalanceTolerance": false,
    "dynamicBalancePlayerFloor": 90,
    "dynamicBalanceExtraSlots": 2
}
```

**Configuration Options:**

**Required:**
- `database` — Sequelize connector (typically `"sqlite"`)

**Optional:**
- `commandPrefix` — command(s) to trigger switch (string or array). Default: `["!switch", "!change"]`
- `discordClient` — Discord connector name for Discord commands. Default: none
- `discordChannelID` — Discord channel ID for admin commands and diagnostics. Default: none

**Switch Behavior:**
- `switchCooldownHours` — hours before player can switch again. Default: `3`
- `switchCooldownMinutes` — overrides `switchCooldownHours` if set. Default: `0` (which causes `switchCooldownHours` to be used)
- `switchEnabledMinutes` — time window after match start or player join to allow switches. Default: `5`
- `maxUnbalancedSlots` — max player difference between teams to allow switch. Default: `3`

**Double Switch:**
- `doubleSwitchCommands` — commands that swap player to opposite team and back (fixes bugs without changing teams). Default: `[]`
- `doubleSwitchCooldownHours` — cooldown for double switch commands. Default: `0.5`
- `doubleSwitchDelaySeconds` — delay between first and second swap. Default: `1`
- `doubleSwitchEnabledMinutes` — time window for double switch. Default: `5`

**Liberal Mode (Seed/Jensen):**
- `liberalSwitchGameModes` — array of mode name substrings that trigger relaxed switching. Default: `["Seed", "Jensen"]`
- `liberalSwitchMaxUnbalancedSlots` — relaxed balance cap used in liberal mode. Default: `6`

**Dynamic Balance Tolerance:**
- `dynamicBalanceTolerance` — enable interpolated extra switch slots that scale down as player count rises. Default: `false`
- `dynamicBalancePlayerFloor` — player count below which full extra slots apply. Default: `90`
- `dynamicBalanceExtraSlots` — maximum extra tolerance slots at the floor. Default: `2`

**Advanced:**
- `endMatchSwitchSlots` — queue size for end-of-round switches. Default: `3`
- `switchToOldTeamAfterRejoin` — auto-switch rejoining players to their pre-disconnect team. Default: `false`
- `scrambleLockdownDurationMinutes` — blocks all players from switching after scramble. Default: `20`

## TeamBalancer Integration

Works with **[Slacker's Team Balancer Plugin](https://github.com/mikebjoyce/squadjs-team-balancer)**:
- Listens for `TEAM_BALANCER_SCRAMBLE_EXECUTED` event
- Adds scrambled players to database with `scrambleLockdownExpiry` timestamp
- Prevents players from changing teams immediately following a team balancer scramble

---

## Credits

**Original Author:** [fantinodavide](https://github.com/fantinodavide)  
**Modified by:** [Slacker](https://github.com/mikebjoyce) (Discord: `real_slacker`)

This plugin is a modified fork with added persistence, TeamBalancer integration, and expanded admin controls.