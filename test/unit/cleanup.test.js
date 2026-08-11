/**
 * Unit Tests: Cleanup
 *
 * Verifies that cleanup() iterates eosID keys (not steamID).
 */

import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import {
    createMockSwitchPlugin,
    mockPlayer,
    resetTestContext,
} from './_helpers.js';

describe('Cleanup', () => {
    /** @type {Awaited<ReturnType<createMockSwitchPlugin>>} */
    let ctx;

    beforeEach(async () => {
        ctx = await createMockSwitchPlugin();
    });

    after(() => {
        resetTestContext(ctx);
    });

    describe('cleanup() — eosID iteration', () => {
        it('prunes playersConnectionTime by eosID', async () => {
            // Add an entry for a player not on the server
            ctx.plugin.playersConnectionTime['eos_stale'] = Date.now() - 100000;

            await ctx.plugin.cleanup();

            // eos_stale should be purged (not on server)
            assert.strictEqual(ctx.plugin.playersConnectionTime['eos_stale'], undefined);
        });

        it('keeps playersConnectionTime for active players', async () => {
            const player = mockPlayer({ eosID: 'eos_active', name: 'ActivePlayer' });
            ctx.server.players.push(player);
            ctx.plugin.playersConnectionTime['eos_active'] = Date.now() - 100000;

            await ctx.plugin.cleanup();

            // Active player's entry should be kept
            assert.ok(ctx.plugin.playersConnectionTime['eos_active']);
        });

        it('prunes stale recentDisconnections by eosID', async () => {
            // Add a stale disconnection (> 20 min ago)
            ctx.plugin.recentDisconnections['eos_stale_disc'] = {
                teamID: 1,
                time: new Date(Date.now() - 25 * 60 * 1000),
            };

            await ctx.plugin.cleanup();

            assert.strictEqual(ctx.plugin.recentDisconnections['eos_stale_disc'], undefined);
        });
    });
});