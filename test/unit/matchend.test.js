/**
 * Unit Tests: Match-End Switching
 *
 * Verifies that match-end operations use eosID.
 */

import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import {
    createMockSwitchPlugin,
    mockPlayer,
    resetTestContext,
} from './_helpers.js';

describe('Match-End Switching', () => {
    /** @type {Awaited<ReturnType<createMockSwitchPlugin>>} */
    let ctx;

    beforeEach(async () => {
        ctx = await createMockSwitchPlugin();
    });

    after(() => {
        resetTestContext(ctx);
    });

    describe('addPlayerToMatchendSwitches', () => {
        it('includes eosID in the Endmatch create call', async () => {
            const player = mockPlayer({
                eosID: 'eos_matchend_test',
                steamID: '76561198000000099',
                name: 'MatchendPlayer',
            });

            await ctx.plugin.addPlayerToMatchendSwitches(player);

            const store = ctx.models['SwitchPlugin_Endmatch']._store;
            assert.strictEqual(store.length, 1);
            assert.strictEqual(store[0].eosID, 'eos_matchend_test');
            assert.strictEqual(store[0].steamID, '76561198000000099');
            assert.strictEqual(store[0].name, 'MatchendPlayer');
        });
    });

    describe('addSquadToMatchendSwitches', () => {
        it('includes eosID for each player in the squad', async () => {
            const players = [
                mockPlayer({ eosID: 'eos_sq_1', teamID: 1, squadID: 1, name: 'SquadP1' }),
                mockPlayer({ eosID: 'eos_sq_2', teamID: 1, squadID: 1, name: 'SquadP2' }),
            ];
            ctx.server.players.push(...players);

            await ctx.plugin.addSquadToMatchendSwitches(1, 1);

            const store = ctx.models['SwitchPlugin_Endmatch']._store;
            assert.strictEqual(store.length, 2);
            assert.strictEqual(store[0].eosID, 'eos_sq_1');
            assert.strictEqual(store[1].eosID, 'eos_sq_2');
        });
    });
});