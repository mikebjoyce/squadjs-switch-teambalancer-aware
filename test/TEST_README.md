# Test Suite: steamID → eosID Conversion Verification

## Purpose

This test suite verifies that the `switch.js` plugin has been successfully refactored to use **`eosID` as the authoritative internal identifier**, with `steamID` retained only as nullable metadata. It also enforces the **RCON boundary rule**: all `AdminForceTeamChange` and `rcon.warn` calls must resolve `eosID → player.name` before execution.

## Architecture

Four layers, from fastest/cheapest to most comprehensive:

| Layer | Location | Tests | Runtime | Dependencies |
|---|---|---|---|---|
| **Static Analysis** | `test/static/` | 35 | < 1s | None (reads `switch.js` as text) |
| **Unit Tests** | `test/unit/` | 40 | ~5s | Mock factory (`_helpers.js`) |
| **Integration** | `test/integration/` | 4 | ~15s | Mock factory |
| **DB Tests** | `test/db/` | 60+ | ~10s (sqlite) / ~30s (all) | Real Sequelize + Docker (mysql/postgres) |

**Total: 140+ tests, zero npm dependencies.** Uses Node's built-in `node:test` runner (Node 18+).

---

## Layer 1: Static Analysis (`test/static/conversion-patterns.test.js`)

Reads `switch.js` as a string and runs regex-based assertions. Catches the most dangerous regressions instantly:

- **Internal state maps** must use `eosID` keys: `_knownConnectedPlayers`, `recentDisconnections`, `_switchedOnJoin`, `playersConnectionTime`, `recentDoubleSwitches`
- **RCON boundary** must use `player.name` in `AdminForceTeamChange` (never `eosID` or `steamID`)
- **Method signatures** must accept `eosID` as first parameter: `switchPlayer`, `handlePlayerLeave`, `doubleSwitchPlayer`, `this.warn`
- **Removed code** verified absent: `_taggedSwitchPlayer`, `getPlayerByUsernameOrSteamID`
- **New code** verified present: `getPlayerByEosID`, `getPlayerByUsernameOrEosID`
- **Event handlers** extract `eosID` as primary: `onChatMessage`, `onPlayerConnected`, `switchToPreDisconnectionTeam`
- **Model schemas** include `eosID` column: `Endmatch`, `PlayerCooldowns`
- **Display strings** reference `eosID`: Discord embeds, check output

**Run:** `node --test test/static/conversion-patterns.test.js`

---

## Layer 2: Unit Tests (`test/unit/`)

Instantiates the Switch plugin with a mock SquadJS environment. The mock factory (`_helpers.js`) reproduces the real SquadJS 4.1.0 `BasePlugin` and `DiscordBasePlugin` contracts from source.

### Mock Infrastructure

| Shim File | Purpose |
|---|---|
| `base-plugin.js` | SquadJS 4.1.0 `BasePlugin` (51 lines, verbatim contract) |
| `discord-base-plugin.js` | SquadJS 4.1.0 `DiscordBasePlugin` (45 lines, verbatim contract) |
| `node_modules/sequelize/index.js` | Minimal Sequelize with `DataTypes` and `Op` static exports |

The mock factory provides:
- **EventEmitter-based server** with `players`, `squads`, `admins`, `currentLayer`, `layerHistory`
- **RCON mock** that records all `execute`, `warn`, and `broadcast` calls for assertion
- **In-memory Sequelize mock** with `define`, `findByPk`, `upsert`, `create`, `destroy`, `findAll`, `count`, `bulkCreate`, `transaction`
- **Accurate connector resolution** matching SquadJS's `optionsSpecification` → `connectors` pattern

### Test Files

| File | Tests | What It Verifies |
|---|---|---|
| `player-lookup.test.js` | 9 | `getPlayerByEosID()` returns by eosID; `getPlayerByUsernameOrEosID()` resolves eosID first, falls back to name; deprecated `getPlayerBySteamID()` still works |
| `rcon-helpers.test.js` | 7 | `switchPlayer(eosID)` resolves to `player.name` for RCON; `this.warn(eosID, msg)` resolves to `player.name`; neither passes raw eosID/steamID to RCON |
| `state-maps.test.js` | 10 | `handlePlayerLeave` stores by eosID key; `onUpdatedPlayerInfo` delta-diffs by eosID; `onPlayerConnected` guards on eosID; `switchToPreDisconnectionTeam` extracts eosID |
| `chat-commands.test.js` | 4 | `onChatMessage` extracts eosID as primary; admin check retains steamID; `!switch` passes eosID to `switchPlayer()`; null-teamID window gate uses eosID |
| `double-switch.test.js` | 3 | `doubleSwitchPlayer` looks up by eosID; checks `recentDoubleSwitches` by eosID; pushes `{ eosID }` on success |
| `cleanup.test.js` | 3 | `cleanup()` prunes `playersConnectionTime` by eosID; keeps active players; prunes stale `recentDisconnections` by eosID |
| `scramble.test.js` | 1 | `onScrambleExecuted` filters affected players by `p.eosID`; writes lockdown records keyed by eosID |
| `matchend.test.js` | 2 | `addPlayerToMatchendSwitches` includes `eosID`; `addSquadToMatchendSwitches` includes `eosID` for each player |
| `discord-messages.test.js` | 1 | Discord `!switch check` embed references eosID |

**Run:** `node --test test/unit/*.test.js`

---

## Layer 3: Integration Tests (`test/integration/switch-flow.test.js`)

Validates eosID flows end-to-end across multiple subsystems:

| Test | Flow |
|---|---|
| Full `!switch` flow | Chat message → player lookup → balance check → RCON switch → cooldown write — all via eosID |
| Disconnect/reconnect flow | Player leaves → stored by eosID → reconnects → looked up by eosID → `_switchedOnJoin` set by eosID |
| Matchend queue flow | Queue player by eosID → round ends → `doSwitchMatchend` switches by eosID |
| Scramble lockdown flow | Scramble executed → lockdown written by eosID → subsequent `!switch` denied by eosID lookup |

**Run:** `node --test test/integration/*.test.js`

---

## Running All Tests

```powershell
# All mock-based tests (static + unit + integration — no Docker needed)
node --test test/static/conversion-patterns.test.js test/unit/*.test.js test/integration/*.test.js

# Static analysis only (fastest)
node --test test/static/conversion-patterns.test.js

# Unit tests only
node --test test/unit/*.test.js

# Integration tests only
node --test test/integration/*.test.js

# DB tests — sqlite only (no Docker needed)
node --test test/db/*.test.js

# DB tests — all dialects (requires Docker)
docker compose -f test/db/docker-compose.yml up -d
node --test test/db/*.test.js
docker compose -f test/db/docker-compose.yml down

# EVERYTHING (mock + DB, all dialects)
docker compose -f test/db/docker-compose.yml up -d
node --test test/static/conversion-patterns.test.js test/unit/*.test.js test/integration/*.test.js test/db/*.test.js
docker compose -f test/db/docker-compose.yml down
```

---

## Layer 4: DB Tests (`test/db/`)

Verifies that the plugin's Sequelize usage works correctly across **all three Sequelize dialects** (sqlite, mysql, postgres) using real database connections. This catches dialect-specific behavior that the in-memory mock cannot (upsert semantics, autoIncrement, type coercion, transaction isolation, `sync({alter})` behavior).

### Infrastructure

| File | Purpose |
|---|---|
| `docker-compose.yml` | MySQL 8.0 (port 3307) + PostgreSQL 16 (port 5433) containers with healthchecks |
| `db-helpers.js` | Sequelize instance factory per dialect, model definitions (mirrors `switch.js` schemas), setup/teardown/truncate utilities |

### Test Files

| File | Tests | What It Verifies |
|---|---|---|
| `db-schema.test.js` | 8 | `sync({alter: true})` creates correct tables/columns; `id` auto-increments; `eosID` is primary key; nullable columns; sync idempotency |
| `db-crud.test.js` | 16 | `create`, `upsert` (insert + update), `findByPk`, `findOne`, `findAll`, `destroy`, `count`, `bulkCreate` with `updateOnDuplicate` |
| `db-transaction.test.js` | 9 | Transaction commit/rollback; `safeTransaction` retry pattern; concurrent writes; non-locking error propagation |
| `db-multi-dialect.test.js` | 30 | Full parameterized suite: schema, PlayerCooldowns CRUD, Endmatch CRUD, transactions, edge cases (empty strings, long strings, unicode, special chars) |

### Auto-Detection

All DB test files automatically detect which dialects are available:
- **sqlite** — always available (uses `:memory:`)
- **mysql** — tested if port 3307 is reachable (Docker container running)
- **postgres** — tested if port 5433 is reachable (Docker container running)

No configuration needed — if Docker containers aren't running, only sqlite tests execute.

### Running DB Tests

```powershell
# SQLite only (no Docker needed — always works)
node --test test/db/db-multi-dialect.test.js

# All DB tests, sqlite only
node --test test/db/*.test.js

# Start Docker containers for mysql + postgres
docker compose -f test/db/docker-compose.yml up -d

# Run all DB tests against all available dialects
node --test test/db/*.test.js

# Stop containers when done
docker compose -f test/db/docker-compose.yml down
```

### What Gets Tested Per Dialect

| Area | sqlite | mysql | postgres |
|---|---|---|---|
| Schema sync (`sync({alter: true})`) | ✅ | ✅ | ✅ |
| `eosID` string primary key | ✅ | ✅ | ✅ |
| `autoIncrement` on Endmatch `id` | ✅ | ✅ | ✅ |
| `upsert` insert + update | ✅ | ✅ | ✅ |
| `bulkCreate` with `updateOnDuplicate` | ✅ | ✅ | ✅ |
| Transaction commit/rollback | ✅ | ✅ | ✅ |
| `safeTransaction` retry (SQLITE_BUSY) | ✅ | ✅ | ✅ |
| Concurrent writes | ✅ | ✅ | ✅ |
| `DataTypes.DATE` round-trip | ✅ | ✅ | ✅ |
| Nullable columns | ✅ | ✅ | ✅ |
| Unicode/special characters | ✅ | ✅ | ✅ |
| Empty string edge cases | ✅ | ✅ | ✅ |

---

## What's NOT Tested (and Why)

| Area | Reason |
|---|---|
| `DiscordBasePlugin` internals | SquadJS framework code — out of scope |
| RCON wire protocol | Requires live Squad server; mocked instead |
| Event ordering/timing races | Requires production log replay; documented in `SQUADJS_PLUGIN_DEV_REFERENCE.md` |
| `_taggedSwitchPlayer` | Removed per Step 2c of conversion checklist |
| Sequelize migrations | Plugin uses `sync({alter: true})`, not migrations — tested via schema tests |

---

## Conversion Checklist Coverage

Every step in `STEAMID_TO_EOSID_CONVERSION_CHECKLIST.md` is covered:

| Step | Description | Covered By |
|---|---|---|
| 1 | Endmatch Model — eosID column | Static: model schema check; Unit: matchend tests |
| 2a | `this.warn` — eosID → player.name | Static: warn signature; Unit: rcon-helpers |
| 2b | `switchPlayer` — eosID → player.name | Static: switchPlayer signature; Unit: rcon-helpers |
| 2c | `_taggedSwitchPlayer` — REMOVED | Static: absence check |
| 3 | `getPlayerByEosID` — new method | Static: existence check; Unit: player-lookup |
| 4 | `getPlayerByUsernameOrEosID` — renamed | Static: existence + old name absent; Unit: player-lookup |
| 5 | Internal state maps → eosID keys | Static: Map/Set key checks; Unit: state-maps |
| 6 | `handlePlayerLeave` — eosID param | Static: signature check; Unit: state-maps |
| 7 | `onPlayerConnected` — eosID lookups | Static: guard check; Unit: state-maps |
| 8 | `switchToPreDisconnectionTeam` — eosID | Static: extraction check; Unit: state-maps |
| 9 | `doubleSwitchPlayer` — eosID param | Static: signature check; Unit: double-switch |
| 10 | `onChatMessage` — eosID primary | Static: extraction check; Unit: chat-commands |
| 11 | `switchSquad` / `doubleSwitchSquad` — eosID | Static: p.eosID references |
| 12 | `cleanup` — eosID iteration | Static: currentEosIDs check; Unit: cleanup |
| 13 | Constructor bindings | Static: binding checks |
| 14 | `onDiscordMessage` display strings | Static: eosID fallback check; Unit: discord-messages |
| 15 | Final validation | All 79 tests passing |

---

## Adding New Tests

1. **Static checks** — add a regex pattern to `conversion-patterns.test.js` if the rule is purely syntactic
2. **Unit tests** — use `createMockSwitchPlugin()` from `_helpers.js` to get a plugin instance, then exercise the method and assert on `ctx.rcon.getCalls()` or `ctx.models`
3. **Integration tests** — chain multiple plugin method calls to verify cross-subsystem eosID flow
4. **DB tests** — use `setupDatabase(dialect)` from `test/db/db-helpers.js` to get a real Sequelize instance with the plugin's models defined. Add tests to `db-multi-dialect.test.js` for general CRUD/transaction coverage, or create a new file in `test/db/` for dialect-specific edge cases.

---

*Generated as part of the steamID → eosID conversion refactor — current as of 2026-08-11*