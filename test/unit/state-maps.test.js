/**
 * Unit Tests: Internal State Maps
 *
 * Verifies that _knownConnectedPlayers, recentDisconnections, _switchedOnJoin,
 * and related internal data structures use eosID as the authoritative key.
 */

import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import {
    createMockSwitchPlugin,
    mockPlayer,
    mockPlayerConnected,
    resetTestContext,
} from './_helpers.js';

describe('Internal State Maps', () => {
    /** @type {Awaited<ReturnType<createMockSwitchPlugin>>} */
    let ctx;

    beforeEach(async () => {
        ctx = await createMockSwitchPlugin();
    });

    after(() => {
        resetTestContext(ctx);
    });

    describe('handlePlayerLeave(eosID, teamID, name)', () => {
        it('stores disconnection data by eosID key', () => {
            ctx.plugin.handlePlayerLeave('eos_player_a', 1, 'PlayerA');

            assert.ok(ctx.plugin.recentDisconnections['eos_player_a']);
            assert.strictEqual(ctx.plugin.recentDisconnections['eos_player_a'].teamID, 1);
        });

        it('purges entries older than 20 minutes', () => {
            // Add an old entry
            const oldTime = new Date(Date.now() - 21 * 60 * 1000);
            ctx.plugin.recentDisconnections['eos_old_player'] = { teamID: 1, time: oldTime };

            // Trigger cleanup via a new leave
            ctx.plugin.handlePlayerLeave('eos_new_player', 2, 'NewPlayer');

            // Old entry should be gone, new entry should remain
            assert.strictEqual(ctx.plugin.recentDisconnections['eos_old_player'], undefined);
            assert.ok(ctx.plugin.recentDisconnections['eos_new_player']);
        });

        it('filters recentDoubleSwitches by eosID on leave', () => {
            ctx.plugin.recentDoubleSwitches = [
                { eosID: 'eos_player_a', datetime: new Date() },
                { eosID: 'eos_player_b', datetime: new Date() },
            ];

            ctx.plugin.handlePlayerLeave('eos_player_a', 1, 'PlayerA');

            assert.strictEqual(ctx.plugin.recentDoubleSwitches.length, 1);
            assert.strictEqual(ctx.plugin.recentDoubleSwitches[0].eosID, 'eos_player_b');
        });
    });

    describe('onUpdatedPlayerInfo — delta-diff by eosID', () => {
        it('registers new players with eosID key in _knownConnectedPlayers', async () => {
            const player = mockPlayer({ eosID: 'eos_delta_new', name: 'DeltaNew', teamID: 1 });
            ctx.server.players.push(player);

            await ctx.plugin.onUpdatedPlayerInfo({});

            assert.ok(ctx.plugin._knownConnectedPlayers.has('eos_delta_new'));
            assert.strictEqual(ctx.plugin._knownConnectedPlayers.get('eos_delta_new').teamID, 1);
        });

        it('detects leaves by eosID delta-diff and calls handlePlayerLeave', async () => {
            const player = mockPlayer({ eosID: 'eos_delta_leave', name: 'DeltaLeave', teamID: 1 });
            ctx.server.players.push(player);

            // Register player first
            await ctx.plugin.onUpdatedPlayerInfo({});
            assert.ok(ctx.plugin._knownConnectedPlayers.has('eos_delta_leave'));

            // Remove from server.players (simulate disconnect)
            ctx.server.players.length = 0;

            // Second poll should detect leave
            await ctx.plugin.onUpdatedPlayerInfo({});

            assert.ok(!ctx.plugin._knownConnectedPlayers.has('eos_delta_leave'));
            assert.ok(ctx.plugin.recentDisconnections['eos_delta_leave']);
        });

        it('skips processing when _nullTeamIDWindowActive is true', async () => {
            ctx.plugin._nullTeamIDWindowActive = true;
            ctx.server.players.push(
                mockPlayer({ eosID: 'eos_null_window', name: 'NullWin', teamID: null }),
            );

            await ctx.plugin.onUpdatedPlayerInfo({});

            // Should NOT register because window is active and player has null teamID
            assert.ok(!ctx.plugin._knownConnectedPlayers.has('eos_null_window'));
        });
    });

    describe('onPlayerConnected — uses eosID', () => {
        it('guards on info.player.eosID', async () => {
            // Missing eosID should return early
            const info = mockPlayerConnected({ eosID: undefined, name: 'NoEos' });
            ctx.server.players.push(info.player);

            await ctx.plugin.onPlayerConnected(info);

            // Should not register
            assert.ok(!ctx.plugin.playersConnectionTime[undefined]);
        });

        it('uses eosID for _switchedOnJoin check', async () => {
            const player = mockPlayer({ eosID: 'eos_join_test', name: 'JoinTest', teamID: 1 });
            const info = mockPlayerConnected(player);
            ctx.server.players.push(player);

            await ctx.plugin.onPlayerConnected(info);

            assert.ok(ctx.plugin._switchedOnJoin.has('eos_join_test'));
        });

        it('uses eosID for recentDisconnections lookup on rejoin', async () => {
            // Simulate: player was on team 2, disconnected, now reconnects
            const player = mockPlayer({ eosID: 'eos_rejoin_test', name: 'RejoinTest', teamID: 1 });
            ctx.plugin.recentDisconnections['eos_rejoin_test'] = {
                teamID: 2,
                time: new Date(),
            };
            ctx.server.players.push(player);

            const info = mockPlayerConnected(player);
            await ctx.plugin.onPlayerConnected(info);

            // Should have registered the connection time from the valid disconnection
            assert.ok(ctx.plugin.playersConnectionTime['eos_rejoin_test']);
        });
    });

    describe('switchToPreDisconnectionTeam — uses eosID', () => {
        it('extracts eosID from info.player', () => {
            const player = mockPlayer({ eosID: 'eos_predisc_test', name: 'PreDisc', teamID: 1 });
            ctx.plugin.recentDisconnections['eos_predisc_test'] = {
                teamID: 2,
                time: new Date(),
            };
            ctx.server.players.push(player);

            // Method should look up by eosID, find the mismatch, and attempt to switch
            // We can verify it doesn't crash
            ctx.plugin.switchToPreDisconnectionTeam({ player });
        });
    });
});