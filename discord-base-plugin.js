/**
 * Shim: discord-base-plugin.js
 *
 * Minimal reproduction of SquadJS 4.1.0 DiscordBasePlugin for testing.
 * The real file lives at squad-server/plugins/discord-base-plugin.js in the
 * SquadJS installation. This shim provides just enough for the Switch plugin
 * to import and extend in a test environment.
 */

import BasePlugin from './base-plugin.js';

export default class DiscordBasePlugin extends BasePlugin {
    static get optionsSpecification() {
        return {
            discordClient: {
                required: true,
                description: 'Discord connector name.',
                connector: 'discord',
                default: 'discord',
            },
        };
    }

    async prepareToMount() {
        // In tests, skip Discord channel fetch
        this.channel = null;
    }

    async sendDiscordMessage(message) {
        // No-op in tests
    }
}