/**
 * Unit Tests: Double Switch
 *
 * Verifies that doubleSwitchPlayer uses eosID throughout.
 */

import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import {
    createMockSwitchPlugin,
    mockPlayer,
    resetTestContext,
} from './_helpers.js';

describe('Double Switch', () => {
    /** @type {Awaited<ReturnType<createMockSwitchPlugin>>} */
    let ctx;

    beforeEach(async () => {
        ctx = await createMockSwitchPlugin();
    });

    after(() => {
        resetTestContext(ctx);
    });

    describe('doubleSwitchPlayer(eosID)', () => {
        it('looks up player by eosID', async () => {
            const player = mockPlayer({
                eosID: 'eos_double_test',
                name: 'DoubleTest',
                teamID: 1,
            });
            ctx.server.players.push(player);

            await ctx.plugin.doubleSwitchPlayer('eos_double_test');

            // Should have executed two switches
            const executes = ctx.rcon.getCalls().execute;
            assert.strictEqual(executes.length, 2);
            assert.ok(executes[0].cmd.includes('AdminForceTeamChange DoubleTest'));
            assert.ok(executes[1].cmd.includes('AdminForceTeamChange DoubleTest'));
        });

        it('checks recentDoubleSwitches by eosID', async () => {
            const player = mockPlayer({
                eosID: 'eos_double_cooldown',
                name: 'DoubleCooldown',
                teamID: 1,
            });
            ctx.server.players.push(player);

            // Add a recent double switch entry
            ctx.plugin.recentDoubleSwitches.push({
                eosID: 'eos_double_cooldown',
                datetime: new Date(),
            });

            await ctx.plugin.doubleSwitchPlayer('eos_double_cooldown');

            // Should be denied due to cooldown
            const warns = ctx.rcon.getCalls().warn;
            const cooldownWarn = warns.find((w) => w.message.includes('Cooldown'));
            assert.ok(cooldownWarn, 'Should warn about double switch cooldown');
        });

        it('pushes { eosID } to recentDoubleSwitches on success', async () => {
            const player = mockPlayer({
                eosID: 'eos_double_new',
                name: 'DoubleNew',
                teamID: 1,
            });
            ctx.server.players.push(player);

            const before = ctx.plugin.recentDoubleSwitches.length;

            await ctx.plugin.doubleSwitchPlayer('eos_double_new');

            assert.strictEqual(ctx.plugin.recentDoubleSwitches.length, before + 1);
            assert.strictEqual(ctx.plugin.recentDoubleSwitches[before].eosID, 'eos_double_new');
        });
    });
});