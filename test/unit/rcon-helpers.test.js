/**
 * Unit Tests: RCON Helpers — switchPlayer & this.warn
 *
 * Verifies that both RCON helpers resolve eosID → player.name
 * at the RCON boundary, per the conversion spec.
 */

import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import {
    createMockSwitchPlugin,
    mockPlayer,
    resetTestContext,
} from './_helpers.js';

describe('RCON Helpers', () => {
    /** @type {Awaited<ReturnType<createMockSwitchPlugin>>} */
    let ctx;

    beforeEach(async () => {
        ctx = await createMockSwitchPlugin();
    });

    after(() => {
        resetTestContext(ctx);
    });

    describe('switchPlayer(eosID)', () => {
        it('resolves eosID to player.name for RCON execute', async () => {
            const player = mockPlayer({
                eosID: 'eos_switch_test_001',
                name: 'SwitchTargetPlayer',
            });
            ctx.server.players.push(player);

            await ctx.plugin.switchPlayer('eos_switch_test_001');

            const executes = ctx.rcon.getCalls().execute;
            assert.strictEqual(executes.length, 1);
            assert.ok(
                executes[0].cmd.includes('AdminForceTeamChange SwitchTargetPlayer'),
                `RCON command should use player.name, got: ${executes[0].cmd}`,
            );
        });

        it('does NOT pass eosID directly to RCON', async () => {
            const player = mockPlayer({
                eosID: 'eos_switch_test_002',
                name: 'AnotherPlayer',
            });
            ctx.server.players.push(player);

            await ctx.plugin.switchPlayer('eos_switch_test_002');

            const executes = ctx.rcon.getCalls().execute;
            assert.strictEqual(executes.length, 1);
            assert.ok(
                !executes[0].cmd.includes('eos_switch_test_002'),
                `RCON command should NOT contain raw eosID, got: ${executes[0].cmd}`,
            );
        });

        it('does NOT pass steamID directly to RCON', async () => {
            const player = mockPlayer({
                eosID: 'eos_switch_test_003',
                steamID: '76561198000000099',
                name: 'SteamPlayer',
            });
            ctx.server.players.push(player);

            await ctx.plugin.switchPlayer('eos_switch_test_003');

            const executes = ctx.rcon.getCalls().execute;
            assert.strictEqual(executes.length, 1);
            assert.ok(
                !executes[0].cmd.includes('76561198000000099'),
                `RCON command should NOT contain steamID, got: ${executes[0].cmd}`,
            );
        });

        it('returns null when player not found', async () => {
            const result = await ctx.plugin.switchPlayer('eos_nonexistent');
            assert.strictEqual(result, null);

            const executes = ctx.rcon.getCalls().execute;
            assert.strictEqual(executes.length, 0, 'Should not execute RCON when player not found');
        });
    });

    describe('this.warn(eosID, msg)', () => {
        it('resolves eosID to player.name for rcon.warn', () => {
            const player = mockPlayer({
                eosID: 'eos_warn_test_001',
                name: 'WarnTargetPlayer',
            });
            ctx.server.players.push(player);

            ctx.plugin.warn('eos_warn_test_001', 'Test warning message');

            const warns = ctx.rcon.getCalls().warn;
            assert.strictEqual(warns.length, 1);
            assert.strictEqual(warns[0].target, 'WarnTargetPlayer');
            assert.ok(warns[0].message.includes('Test warning message'));
        });

        it('does NOT pass eosID directly to rcon.warn', () => {
            const player = mockPlayer({
                eosID: 'eos_warn_test_002',
                name: 'PlayerTwo',
            });
            ctx.server.players.push(player);

            ctx.plugin.warn('eos_warn_test_002', 'Another warning');

            const warns = ctx.rcon.getCalls().warn;
            assert.strictEqual(warns.length, 1);
            assert.notStrictEqual(warns[0].target, 'eos_warn_test_002');
        });

        it('silently logs when player not found (no rcon call)', () => {
            ctx.plugin.warn('eos_nonexistent', 'Ghost warning');

            const warns = ctx.rcon.getCalls().warn;
            assert.strictEqual(warns.length, 0, 'Should not call rcon.warn when player not found');
        });
    });
});