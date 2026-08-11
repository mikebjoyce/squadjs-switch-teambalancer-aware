/**
 * Static Analysis: steamID → eosID Conversion Verification
 *
 * Reads switch.js as a string and runs regex-based assertions to verify
 * that the conversion refactor is complete and no steamID-based internal
 * keys remain. Zero dependencies — uses Node's built-in test runner.
 *
 * Run: node --test test/static/conversion-patterns.test.js
 */

import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const switchPath = join(__dirname, '..', '..', 'switch.js');
const source = readFileSync(switchPath, 'utf-8');

describe('Static Analysis: steamID → eosID Conversion', () => {

    describe('Internal State Maps — Must Use eosID Keys', () => {
        it('_knownConnectedPlayers.get() uses eosID, not steamID', () => {
            const bad = source.match(/_knownConnectedPlayers\.get\(\s*(?:p\.)?steamID\b/g);
            assert.strictEqual(bad, null, `Found steamID key in _knownConnectedPlayers.get(): ${bad}`);
        });

        it('_knownConnectedPlayers.set() uses eosID, not steamID', () => {
            const bad = source.match(/_knownConnectedPlayers\.set\(\s*(?:p\.)?steamID\b/g);
            assert.strictEqual(bad, null, `Found steamID key in _knownConnectedPlayers.set(): ${bad}`);
        });

        it('_knownConnectedPlayers.has() uses eosID, not steamID', () => {
            const bad = source.match(/_knownConnectedPlayers\.has\(\s*(?:p\.)?steamID\b/g);
            assert.strictEqual(bad, null, `Found steamID key in _knownConnectedPlayers.has(): ${bad}`);
        });

        it('_knownConnectedPlayers.delete() uses eosID, not steamID', () => {
            const bad = source.match(/_knownConnectedPlayers\.delete\(\s*(?:p\.)?steamID\b/g);
            assert.strictEqual(bad, null, `Found steamID key in _knownConnectedPlayers.delete(): ${bad}`);
        });

        it('_knownConnectedPlayers.entries() loop uses eosID variable', () => {
            // The for...of destructuring should use eosID, not steamID
            const bad = source.match(/for\s*\(\s*\[\s*steamID\s*,\s*data\s*\]\s+of\s+this\._knownConnectedPlayers\.entries\(\)/g);
            assert.strictEqual(bad, null, `Found steamID destructuring in _knownConnectedPlayers.entries() loop: ${bad}`);
        });
    });

    describe('_switchedOnJoin Set — Must Use eosID', () => {
        it('_switchedOnJoin.has() uses eosID, not steamID', () => {
            const bad = source.match(/_switchedOnJoin\.has\(\s*(?:p\.)?steamID\b/g);
            assert.strictEqual(bad, null, `Found steamID key in _switchedOnJoin.has(): ${bad}`);
        });

        it('_switchedOnJoin.add() uses eosID, not steamID', () => {
            const bad = source.match(/_switchedOnJoin\.add\(\s*(?:p\.)?steamID\b/g);
            assert.strictEqual(bad, null, `Found steamID key in _switchedOnJoin.add(): ${bad}`);
        });
    });

    describe('recentDisconnections Object — Must Use eosID Keys', () => {
        it('recentDisconnections indexed by eosID, not steamID', () => {
            const bad = source.match(/recentDisconnections\[\s*steamID\s*\]/g);
            assert.strictEqual(bad, null, `Found steamID key in recentDisconnections[]: ${bad}`);
        });

        it('recentDisconnections indexed by p.steamID', () => {
            const bad = source.match(/recentDisconnections\[\s*p\.steamID\s*\]/g);
            assert.strictEqual(bad, null, `Found p.steamID key in recentDisconnections[]: ${bad}`);
        });
    });

    describe('RCON Boundary — Must Use player.name', () => {
        it('AdminForceTeamChange uses player.name, never eosID or steamID', () => {
            const badEos = source.match(/AdminForceTeamChange \$\{(?:player\.)?eosID\}/g);
            const badSteam = source.match(/AdminForceTeamChange \$\{(?:player\.)?steamID\}/g);
            assert.strictEqual(badEos, null, `Found eosID in AdminForceTeamChange: ${badEos}`);
            assert.strictEqual(badSteam, null, `Found steamID in AdminForceTeamChange: ${badSteam}`);
        });

        it('AdminForceTeamChange uses player.name', () => {
            const good = source.match(/AdminForceTeamChange \$\{player\.name\}/g);
            assert.ok(good && good.length >= 1, 'AdminForceTeamChange should use player.name');
        });
    });

    describe('Method Signatures — First Param Must Be eosID', () => {
        it('this.warn() first argument is eosID', () => {
            // Count warn calls that pass steamID as first arg (should be zero)
            const bad = source.match(/this\.warn\(\s*steamID\s*,/g);
            assert.strictEqual(bad, null, `Found this.warn(steamID, ...): ${bad}`);
        });

        it('switchPlayer() first argument is eosID', () => {
            const bad = source.match(/switchPlayer\(\s*steamID\b/g);
            assert.strictEqual(bad, null, `Found switchPlayer(steamID): ${bad}`);
        });

        it('handlePlayerLeave() first parameter is eosID', () => {
            // Check the method definition
            const def = source.match(/handlePlayerLeave\(\s*(\w+)\s*,/);
            assert.ok(def, 'handlePlayerLeave method definition not found');
            assert.strictEqual(def[1], 'eosID', `handlePlayerLeave first param should be eosID, got: ${def[1]}`);
        });

        it('doubleSwitchPlayer() first parameter is eosID', () => {
            const def = source.match(/doubleSwitchPlayer\(\s*(\w+)\s*,/);
            assert.ok(def, 'doubleSwitchPlayer method definition not found');
            assert.strictEqual(def[1], 'eosID', `doubleSwitchPlayer first param should be eosID, got: ${def[1]}`);
        });

        it('_taggedSwitchPlayer() is removed (per Step 2c)', () => {
            // Step 2c removed _taggedSwitchPlayer entirely — it should not exist
            const found = source.match(/_taggedSwitchPlayer\s*\(/g);
            assert.strictEqual(found, null, `_taggedSwitchPlayer should be removed, but found: ${found}`);
        });
    });

    describe('Method Existence — New/Renamed Methods', () => {
        it('getPlayerByEosID method exists', () => {
            assert.ok(source.includes('getPlayerByEosID'), 'getPlayerByEosID method should exist');
        });

        it('getPlayerByUsernameOrEosID method exists', () => {
            assert.ok(source.includes('getPlayerByUsernameOrEosID'), 'getPlayerByUsernameOrEosID method should exist');
        });

        it('getPlayerByUsernameOrSteamID is no longer referenced', () => {
            assert.ok(!source.includes('getPlayerByUsernameOrSteamID'), 'getPlayerByUsernameOrSteamID should not be referenced');
        });
    });

    describe('Event Handlers — Extract eosID as Primary', () => {
        it('onPlayerConnected guards on info.player.eosID', () => {
            assert.ok(
                source.includes("!info?.player?.eosID") || source.includes('!info?.player?.eosID'),
                'onPlayerConnected should guard on eosID'
            );
        });

        it('onChatMessage extracts eosID as primary', () => {
            assert.ok(
                source.includes('const eosID = info.player?.eosID'),
                'onChatMessage should extract eosID'
            );
        });

        it('switchToPreDisconnectionTeam extracts eosID from info.player', () => {
            assert.ok(
                source.includes('const eosID = info.player.eosID') || source.includes("const eosID = info.player?.eosID"),
                'switchToPreDisconnectionTeam should extract eosID'
            );
        });
    });

    describe('Data Structures — eosID as Primary Key', () => {
        it('recentDoubleSwitches array items use eosID', () => {
            const bad = source.match(/recentDoubleSwitches.*\.steamID/g);
            assert.strictEqual(bad, null, `Found .steamID on recentDoubleSwitches items: ${bad}`);
        });

        it('playersConnectionTime indexed by eosID', () => {
            const bad = source.match(/playersConnectionTime\[\s*steamID\s*\]/g);
            assert.strictEqual(bad, null, `Found steamID key in playersConnectionTime[]: ${bad}`);
        });

        it('onScrambleExecuted uses p.eosID for filtering', () => {
            // Should filter by eosID, not steamID
            const hasEosIDFilter = source.includes('p.eosID') && source.includes('onScrambleExecuted');
            assert.ok(hasEosIDFilter, 'onScrambleExecuted should reference p.eosID');
        });
    });

    describe('Display Strings — eosID in Output', () => {
        it('Discord embed uses eosID fallback', () => {
            assert.ok(
                source.includes('p.eosID || p.steamID') || source.includes('p.playerName || p.eosID'),
                'Discord display should include eosID fallback'
            );
        });

        it('Discord check embed shows EOSID', () => {
            assert.ok(
                source.includes('**EOSID:**'),
                'Discord check embed should show EOSID field'
            );
        });
    });

    describe('Cleanup — Iterates eosID Keys', () => {
        it('cleanup builds currentEosIDs Set', () => {
            assert.ok(
                source.includes('currentEosIDs'),
                'cleanup should build currentEosIDs Set'
            );
        });

        it('cleanup does not build currentSteamIDs Set', () => {
            assert.ok(
                !source.includes('currentSteamIDs'),
                'cleanup should not reference currentSteamIDs'
            );
        });
    });

    describe('Matchend — Uses eosID', () => {
        it('doSwitchMatchend uses pl.eosID', () => {
            assert.ok(
                source.includes('pl.eosID'),
                'doSwitchMatchend should reference pl.eosID'
            );
        });
    });

    describe('Constructor Bindings — Updated Methods Bound', () => {
        it('getPlayerByEosID is bound in constructor', () => {
            assert.ok(
                source.includes('this.getPlayerByEosID = this.getPlayerByEosID.bind(this)'),
                'getPlayerByEosID should be bound in constructor'
            );
        });

        it('getPlayerByUsernameOrEosID is bound in constructor', () => {
            assert.ok(
                source.includes('this.getPlayerByUsernameOrEosID = this.getPlayerByUsernameOrEosID.bind(this)'),
                'getPlayerByUsernameOrEosID should be bound in constructor'
            );
        });
    });

    describe('Endmatch Model — eosID Column Present', () => {
        it('Endmatch model schema includes eosID field', () => {
            assert.ok(
                source.includes("eosID:") && source.includes("DataTypes.STRING"),
                'Endmatch model should have eosID column'
            );
        });

        it('addPlayerToMatchendSwitches includes eosID', () => {
            // The create call should include eosID
            const inCreateContext = source.includes('eosID: player.eosID');
            assert.ok(inCreateContext, 'addPlayerToMatchendSwitches should include eosID in create()');
        });
    });

    describe('PlayerCooldowns Model — eosID is Primary Key', () => {
        it('PlayerCooldowns model uses eosID as primary key', () => {
            assert.ok(
                source.includes("eosID:") && source.includes("primaryKey: true"),
                'PlayerCooldowns model should have eosID as primary key'
            );
        });
    });
});