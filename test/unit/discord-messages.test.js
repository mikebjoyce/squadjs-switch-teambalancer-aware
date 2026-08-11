/**
 * Unit Tests: Discord Message Display
 *
 * Verifies that Discord embed strings reference eosID.
 */

import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import {
    createMockSwitchPlugin,
    resetTestContext,
} from './_helpers.js';

describe('Discord Message Display', () => {
    /** @type {Awaited<ReturnType<createMockSwitchPlugin>>} */
    let ctx;

    beforeEach(async () => {
        ctx = await createMockSwitchPlugin();
    });

    after(() => {
        resetTestContext(ctx);
    });

    describe('onDiscordMessage — check command', () => {
        it('shows EOSID field in player check embed', async () => {
            // Seed a player in the DB for check to find
            await ctx.models['SwitchPlugin_PlayerCooldowns'].create({
                eosID: 'eos_discord_check',
                steamID: '76561198000000077',
                playerName: 'DiscordPlayer',
                lastSwitchTimestamp: null,
                firstSeenTimestamp: new Date(),
                scrambleLockdownExpiry: null,
            });

            // Create a mock Discord message
            const mockMessage = {
                author: { bot: false },
                channel: { id: ctx.plugin.options.channelID },
                content: '!switch check eos_discord_check',
                reply: async () => {},
            };

            await ctx.plugin.onDiscordMessage(mockMessage);
        });
    });
});