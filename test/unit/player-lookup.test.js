/**
 * Unit Tests: Player Lookup Methods
 *
 * Verifies that getPlayerByEosID, getPlayerByUsernameOrEosID,
 * and getPlayerBySteamID (deprecated) correctly use eosID.
 */

import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import {
    createMockSwitchPlugin,
    mockPlayer,
    resetTestContext,
} from './_helpers.js';

describe('Player Lookup Methods', () => {
    /** @type {Awaited<ReturnType<createMockSwitchPlugin>>} */
    let ctx;

    beforeEach(async () => {
        ctx = await createMockSwitchPlugin();
    });

    after(() => {
        resetTestContext(ctx);
    });

    describe('getPlayerByEosID()', () => {
        it('returns player when eosID matches', () => {
            const player = mockPlayer({ eosID: 'eos_test_abc123' });
            ctx.server.players.push(player);

            const result = ctx.plugin.getPlayerByEosID('eos_test_abc123');
            assert.ok(result);
            assert.strictEqual(result.eosID, 'eos_test_abc123');
            assert.strictEqual(result.name, 'TestPlayer');
        });

        it('returns undefined when no eosID matches', () => {
            ctx.server.players.push(mockPlayer({ eosID: 'eos_test_abc123' }));

            const result = ctx.plugin.getPlayerByEosID('eos_nonexistent');
            assert.strictEqual(result, undefined);
        });

        it('returns undefined when players array is empty', () => {
            const result = ctx.plugin.getPlayerByEosID('eos_test_abc123');
            assert.strictEqual(result, undefined);
        });

        it('finds correct player among multiple players', () => {
            ctx.server.players.push(
                mockPlayer({ eosID: 'eos_a', name: 'PlayerA' }),
                mockPlayer({ eosID: 'eos_b', name: 'PlayerB' }),
                mockPlayer({ eosID: 'eos_c', name: 'PlayerC' }),
            );

            const result = ctx.plugin.getPlayerByEosID('eos_b');
            assert.ok(result);
            assert.strictEqual(result.name, 'PlayerB');
        });
    });

    describe('getPlayerByUsernameOrEosID()', () => {
        it('resolves by eosID first (exact match)', () => {
            const player = mockPlayer({ eosID: 'eos_test_abc', name: 'TargetPlayer' });
            ctx.server.players.push(player);

            const result = ctx.plugin.getPlayerByUsernameOrEosID('eos_caller', 'eos_test_abc');
            assert.ok(result);
            assert.strictEqual(result.eosID, 'eos_test_abc');
        });

        it('falls back to case-insensitive name search', () => {
            const player = mockPlayer({ eosID: 'eos_test_abc', name: 'TargetPlayer123' });
            ctx.server.players.push(player);

            const result = ctx.plugin.getPlayerByUsernameOrEosID('eos_caller', 'targetplayer');
            assert.ok(result);
            assert.strictEqual(result.eosID, 'eos_test_abc');
        });

        it('sends warn when no match found', () => {
            // The caller must exist for this.warn() to resolve eosID → player.name
            ctx.server.players.push(mockPlayer({ eosID: 'eos_caller', name: 'CallerPlayer' }));

            ctx.plugin.getPlayerByUsernameOrEosID('eos_caller', 'nonexistent');

            const warns = ctx.rcon.getCalls().warn;
            assert.strictEqual(warns.length, 1);
            assert.ok(warns[0].message.includes('No player found matching'));
        });

        it('sends warn when multiple name matches found', () => {
            ctx.server.players.push(
                mockPlayer({ eosID: 'eos_caller', name: 'CallerPlayer' }),
                mockPlayer({ eosID: 'eos_a', name: 'TestPlayer' }),
                mockPlayer({ eosID: 'eos_b', name: 'OtherTestPlayer' }),
            );

            ctx.plugin.getPlayerByUsernameOrEosID('eos_caller', 'test');
            // The warn should go to eos_caller about multiple matches
            const warns = ctx.rcon.getCalls().warn;
            assert.strictEqual(warns.length, 1);
            assert.ok(warns[0].message.includes('Multiple'));
        });
    });

    describe('getPlayerBySteamID() — deprecated', () => {
        it('still works via steamID lookup', () => {
            const player = mockPlayer({ steamID: '76561198000000001', eosID: 'eos_xyz' });
            ctx.server.players.push(player);

            const result = ctx.plugin.getPlayerBySteamID('76561198000000001');
            assert.ok(result);
            assert.strictEqual(result.steamID, '76561198000000001');
            assert.strictEqual(result.eosID, 'eos_xyz');
        });
    });
});