/**
 * Unit Tests: Scramble Handler
 *
 * Verifies that onScrambleExecuted uses eosID for all player operations.
 */

import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import {
    createMockSwitchPlugin,
    mockPlayer,
    resetTestContext,
} from './_helpers.js';

describe('Scramble Handler', () => {
    /** @type {Awaited<ReturnType<createMockSwitchPlugin>>} */
    let ctx;

    beforeEach(async () => {
        ctx = await createMockSwitchPlugin();
    });

    after(() => {
        resetTestContext(ctx);
    });

    describe('onScrambleExecuted', () => {
        it('filters affected players by eosID', async () => {
            const data = {
                affectedPlayers: [
                    { eosID: 'eos_scramble_1', steamID: '76561198000000001', name: 'Player1' },
                    { eosID: 'eos_scramble_2', steamID: '76561198000000002', name: 'Player2' },
                    // This player has no eosID — should be skipped
                    { eosID: null, steamID: '76561198000000003', name: 'NoEosPlayer' },
                ],
            };

            await ctx.plugin.onScrambleExecuted(data);

            // Should have written lockdown for 2 players (the one with null eosID filtered out)
            const records = ctx.models['SwitchPlugin_PlayerCooldowns']._store;
            assert.strictEqual(records.length, 2);
            assert.strictEqual(records[0].eosID, 'eos_scramble_1');
            assert.strictEqual(records[1].eosID, 'eos_scramble_2');
        });
    });
});