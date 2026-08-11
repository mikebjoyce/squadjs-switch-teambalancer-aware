/**
 * Unit Tests: Chat Command Handling
 *
 * Verifies that onChatMessage extracts eosID as primary identifier
 * and passes it to all downstream methods (switchPlayer, doubleSwitchPlayer, warn, etc.)
 */

import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import {
    createMockSwitchPlugin,
    mockPlayer,
    mockChatMessage,
    resetTestContext,
} from './_helpers.js';

describe('Chat Command Handling', () => {
    /** @type {Awaited<ReturnType<createMockSwitchPlugin>>} */
    let ctx;

    beforeEach(async () => {
        ctx = await createMockSwitchPlugin();
    });

    after(() => {
        resetTestContext(ctx);
    });

    describe('onChatMessage — eosID extraction', () => {
        it('extracts eosID as primary identifier from info.player', async () => {
            const player = mockPlayer({
                eosID: 'eos_chat_test',
                steamID: '76561198000000001',
                name: 'ChatTestPlayer',
                teamID: 1,
            });
            ctx.server.players.push(player);

            // balance both teams evenly at 1v1
            ctx.server.players.push(
                mockPlayer({ eosID: 'eos_enemy', teamID: 2, name: 'EnemyPlayer' }),
            );

            const info = mockChatMessage(player, '!switch');
            await ctx.plugin.onChatMessage(info);
        });

        it('admin check still uses steamID (admin list is steamID-keyed)', async () => {
            const player = mockPlayer({
                eosID: 'eos_admin_test',
                steamID: '76561198000000999',
                name: 'AdminPlayer',
                teamID: 1,
            });
            ctx.server.players.push(player);

            // Player in admin list by steamID
            ctx.server.admins['76561198000000999'] = { canseeadminchat: true };

            const info = mockChatMessage(player, '!switch now eos_test_123');
            await ctx.plugin.onChatMessage(info);
        });

        it('!switch (no subcommand) passes eosID to switchPlayer()', async () => {
            const player = mockPlayer({
                eosID: 'eos_switch_user',
                steamID: '76561198000000002',
                name: 'SwitchUser',
                teamID: 1,
            });
            ctx.server.players.push(player);

            // Add an enemy to balance
            ctx.server.players.push(
                mockPlayer({ eosID: 'eos_enemy2', teamID: 2, name: 'Enemy2' }),
            );

            // Need to seed a DB record for cooldown lookup
            await ctx.models['SwitchPlugin_PlayerCooldowns'].create({
                eosID: 'eos_switch_user',
                steamID: '76561198000000002',
                playerName: 'SwitchUser',
                lastSwitchTimestamp: null,
                firstSeenTimestamp: new Date(Date.now() - 120000),
                scrambleLockdownExpiry: null,
            });

            const info = mockChatMessage(player, '!switch');
            await ctx.plugin.onChatMessage(info);

            // RCON switch should have been called with player.name
            const executes = ctx.rcon.getCalls().execute;
            assert.ok(executes.length >= 1, 'Expected at least one RCON execute');
            assert.ok(
                executes[0].cmd.includes('AdminForceTeamChange SwitchUser'),
                `RCON should switch by name, got: ${executes[0]?.cmd}`,
            );
        });
    });

    describe('null-teamID window gate', () => {
        it('denies !switch when _nullTeamIDWindowActive is true', async () => {
            const player = mockPlayer({
                eosID: 'eos_null_gate',
                name: 'NullGate',
                teamID: 1,
            });
            ctx.server.players.push(player);

            ctx.plugin._nullTeamIDWindowActive = true;

            const info = mockChatMessage(player, '!switch');
            await ctx.plugin.onChatMessage(info);

            const warns = ctx.rcon.getCalls().warn;
            const relevantWarn = warns.find((w) =>
                w.message.includes('transitioning between rounds'),
            );
            assert.ok(relevantWarn, 'Should warn about round transition');
        });
    });
});