/**
 * Integration Smoke Tests: End-to-End eosID Flow
 *
 * Validates that eosID flows correctly across multiple subsystems
 * without mocking individual call sites.
 */

import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import {
    createMockSwitchPlugin,
    mockPlayer,
    mockChatMessage,
    mockPlayerConnected,
    resetTestContext,
} from '../unit/_helpers.js';

describe('Integration: End-to-End eosID Flow', () => {
    /** @type {Awaited<ReturnType<createMockSwitchPlugin>>} */
    let ctx;

    beforeEach(async () => {
        ctx = await createMockSwitchPlugin();
    });

    after(() => {
        resetTestContext(ctx);
    });

    describe('Full !switch flow', () => {
        it('chat → lookup → balance → RCON → cooldown — all via eosID', async () => {
            const player = mockPlayer({
                eosID: 'eos_flow_switch',
                steamID: '76561198000000101',
                name: 'FlowSwitchPlayer',
                teamID: 1,
            });
            ctx.server.players.push(player);
            ctx.server.players.push(
                mockPlayer({ eosID: 'eos_flow_enemy', teamID: 2, name: 'FlowEnemy' }),
            );

            // Seed DB record
            await ctx.models['SwitchPlugin_PlayerCooldowns'].create({
                eosID: 'eos_flow_switch',
                steamID: '76561198000000101',
                playerName: 'FlowSwitchPlayer',
                lastSwitchTimestamp: null,
                firstSeenTimestamp: new Date(Date.now() - 120000),
                scrambleLockdownExpiry: null,
            });

            const info = mockChatMessage(player, '!switch');
            await ctx.plugin.onChatMessage(info);

            // Verify RCON was called with player.name (not eosID)
            const executes = ctx.rcon.getCalls().execute;
            assert.ok(executes.length >= 1);
            assert.ok(executes[0].cmd.includes('AdminForceTeamChange FlowSwitchPlayer'));

            // Verify cooldown was written with eosID as primary key
            const cooldownRecord = await ctx.models['SwitchPlugin_PlayerCooldowns'].findByPk('eos_flow_switch');
            assert.ok(cooldownRecord);
            assert.ok(cooldownRecord.lastSwitchTimestamp);
        });
    });

    describe('Full disconnect/reconnect flow', () => {
        it('leave → store by eosID → rejoin → lookup by eosID → switch', async () => {
            const player = mockPlayer({
                eosID: 'eos_flow_rejoin',
                steamID: '76561198000000102',
                name: 'FlowRejoinPlayer',
                teamID: 2,
            });

            // Step 1: Register player via UPDATED_PLAYER_INFORMATION
            ctx.server.players.push(player);
            await ctx.plugin.onUpdatedPlayerInfo({});

            // Step 2: Player disconnects (removed from server.players)
            ctx.server.players.length = 0;
            await ctx.plugin.onUpdatedPlayerInfo({});

            // Verify disconnection stored by eosID
            assert.ok(ctx.plugin.recentDisconnections['eos_flow_rejoin']);
            assert.strictEqual(ctx.plugin.recentDisconnections['eos_flow_rejoin'].teamID, 2);

            // Step 3: Player reconnects on team 1
            const rejoinPlayer = mockPlayer({
                eosID: 'eos_flow_rejoin',
                steamID: '76561198000000102',
                name: 'FlowRejoinPlayer',
                teamID: 1,
            });
            ctx.server.players.push(rejoinPlayer);

            const info = mockPlayerConnected(rejoinPlayer);
            await ctx.plugin.onPlayerConnected(info);

            // Verify _switchedOnJoin was set by eosID
            assert.ok(ctx.plugin._switchedOnJoin.has('eos_flow_rejoin'));
        });
    });

    describe('Full matchend queue flow', () => {
        it('queue by eosID → round ends → switch by eosID', async () => {
            const player = mockPlayer({
                eosID: 'eos_flow_matchend',
                steamID: '76561198000000103',
                name: 'FlowMatchendPlayer',
                teamID: 1,
            });
            ctx.server.players.push(player);

            // Queue player
            await ctx.plugin.addPlayerToMatchendSwitches(player);

            // Verify queued with eosID
            const queue = ctx.models['SwitchPlugin_Endmatch']._store;
            assert.strictEqual(queue.length, 1);
            assert.strictEqual(queue[0].eosID, 'eos_flow_matchend');

            // Simulate round end → doSwitchMatchend
            await ctx.plugin.doSwitchMatchend();

            // Verify RCON switch was called with player.name
            const executes = ctx.rcon.getCalls().execute;
            assert.ok(executes.length >= 1);
            assert.ok(executes[0].cmd.includes('AdminForceTeamChange FlowMatchendPlayer'));
        });
    });

    describe('Full scramble lockdown flow', () => {
        it('scramble → write lockdown by eosID → !switch checks lockdown by eosID', async () => {
            const player = mockPlayer({
                eosID: 'eos_flow_scramble',
                steamID: '76561198000000104',
                name: 'FlowScramblePlayer',
                teamID: 1,
            });
            ctx.server.players.push(player);
            ctx.server.players.push(
                mockPlayer({ eosID: 'eos_flow_enemy3', teamID: 2, name: 'FlowEnemy3' }),
            );

            // Step 1: Scramble executed
            await ctx.plugin.onScrambleExecuted({
                affectedPlayers: [
                    { eosID: 'eos_flow_scramble', steamID: '76561198000000104', name: 'FlowScramblePlayer' },
                ],
            });

            // Verify lockdown written by eosID
            const lockdownRecord = await ctx.models['SwitchPlugin_PlayerCooldowns'].findByPk('eos_flow_scramble');
            assert.ok(lockdownRecord);
            assert.ok(lockdownRecord.scrambleLockdownExpiry);

            // Step 2: Player tries to !switch — should be denied
            const info = mockChatMessage(player, '!switch');
            await ctx.plugin.onChatMessage(info);

            const warns = ctx.rcon.getCalls().warn;
            const lockdownWarn = warns.find((w) => w.message.includes('Scramble Lock'));
            assert.ok(lockdownWarn, 'Should deny switch due to scramble lockdown');
        });
    });
});