/**
 * Mock Factory for Switch Plugin Unit Tests
 *
 * Reproduces the SquadJS 4.1.0 BasePlugin + DiscordBasePlugin contracts
 * closely enough to instantiate the Switch plugin in a test environment.
 *
 * Ground truth sources:
 *   - SquadJS 4.1.0: squad-server/plugins/base-plugin.js (51 lines)
 *   - SquadJS 4.1.0: squad-server/plugins/discord-base-plugin.js (45 lines)
 *   - SquadJS API Reference: creating-squadjs-plugins/references/api-reference.md
 */

import { EventEmitter } from 'node:events';

/**
 * Creates a mock player object with the standard SquadJS player shape.
 * @param {object} overrides - Properties to override.
 * @returns {object} Mock player.
 */
export function mockPlayer(overrides = {}) {
    return {
        playerID: 1,
        name: 'TestPlayer',
        teamID: 1,
        squadID: null,
        isLeader: false,
        role: 'US_Rifleman',
        steamID: '76561198000000000',
        eosID: 'eos00000000000000000000000000000001',
        playercontroller: null,
        squad: null,
        ...overrides,
    };
}

/**
 * Creates multiple mock players.
 * @param {number} count - Number of players to create.
 * @param {Function} factory - (index) => overrides object.
 * @returns {object[]} Array of mock players.
 */
export function mockPlayers(count, factory = (i) => ({})) {
    return Array.from({ length: count }, (_, i) =>
        mockPlayer({
            playerID: i + 1,
            name: `Player${i + 1}`,
            eosID: `eos${String(i + 1).padStart(32, '0')}`,
            steamID: `7656119800000000${String(i + 1).padStart(2, '0')}`,
            ...factory(i),
        })
    );
}

/**
 * Creates a mock RCON interface.
 * Records calls for assertion.
 * @returns {object} Mock RCON object.
 */
export function mockRcon() {
    const calls = {
        execute: [],
        warn: [],
        broadcast: [],
    };

    return {
        async execute(cmd) {
            calls.execute.push({ cmd, time: new Date() });
            return `OK: ${cmd}`;
        },
        async warn(playerNameOrId, message) {
            calls.warn.push({ target: playerNameOrId, message, time: new Date() });
            return 'OK';
        },
        async broadcast(message) {
            calls.broadcast.push({ message, time: new Date() });
            return 'OK';
        },
        getCalls() {
            return calls;
        },
        resetCalls() {
            calls.execute.length = 0;
            calls.warn.length = 0;
            calls.broadcast.length = 0;
        },
    };
}

/**
 * Creates a mock Sequelize connector.
 * Models are stored in-memory for test assertions.
 * @returns {object} Mock Sequelize connector + model registry.
 */
export function mockDatabase() {
    const models = {};

    // In-memory stores for models
    const stores = {};

    /**
     * Creates a mock model with in-memory storage.
     */
    function createMockModel(name, schema) {
        const store = [];

        const findOne = async (opts) => {
            const where = opts?.where || {};
            for (const record of store) {
                let match = true;
                for (const [key, val] of Object.entries(where)) {
                    if (record[key] !== val) {
                        match = false;
                        break;
                    }
                }
                if (match) return { ...record };
            }
            return null;
        };

        const findAll = async (opts) => {
            const where = opts?.where || {};
            let results = [...store];
            for (const [key, val] of Object.entries(where)) {
                if (val && typeof val === 'object' && val[Symbol.for('like')]) {
                    results = results.filter((r) =>
                        String(r[key] || '').toLowerCase().includes(String(val[Symbol.for('like')]).toLowerCase())
                    );
                } else if (val && typeof val === 'object' && val[Symbol.for('op.in')]) {
                    results = results.filter((r) => val[Symbol.for('op.in')].includes(r[key]));
                } else {
                    results = results.filter((r) => r[key] === val);
                }
            }
            return results.map((r) => ({ ...r }));
        };

        const findByPk = async (pk) => {
            // Find the primary key field
            const pkField = Object.entries(schema).find(([, s]) => s.primaryKey)?.[0] || 'id';
            return store.find((r) => r[pkField] === pk) || null;
        };

        const upsert = async (values, opts) => {
            const pkField = Object.entries(schema).find(([, s]) => s.primaryKey)?.[0] || 'eosID';
            const idx = store.findIndex((r) => r[pkField] === values[pkField]);
            if (idx >= 0) {
                store[idx] = { ...store[idx], ...values };
            } else {
                store.push({ ...values });
            }
            return [{ ...store[idx >= 0 ? idx : store.length - 1] }, idx < 0];
        };

        const create = async (values) => {
            const record = { ...values };
            if (schema.id?.autoIncrement) {
                record.id = store.length + 1;
            }
            store.push(record);
            return { ...record };
        };

        const destroy = async (opts) => {
            const where = opts?.where || {};
            const toRemove = [];
            for (let i = store.length - 1; i >= 0; i--) {
                let match = true;
                for (const [key, val] of Object.entries(where)) {
                    if (store[i][key] !== val) {
                        match = false;
                        break;
                    }
                }
                if (match) toRemove.push(i);
            }
            for (const i of toRemove) store.splice(i, 1);
            return toRemove.length;
        };

        const count = async (opts) => {
            const all = await findAll(opts);
            return all.length;
        };

        const sync = async () => {};

        const bulkCreate = async (records, opts) => {
            if (opts?.updateOnDuplicate) {
                for (const rec of records) {
                    await upsert(rec);
                }
            } else {
                for (const rec of records) {
                    await create(rec);
                }
            }
            return records.length;
        };

        // Expose store for test assertions
        const model = {
            findOne,
            findAll,
            findByPk,
            upsert,
            create,
            destroy,
            count,
            sync,
            bulkCreate,
            _store: store,
            _schema: schema,
        };

        return model;
    }

    const db = {
        define(modelName, schema) {
            const model = createMockModel(modelName, schema);
            models[modelName] = model;
            stores[modelName] = model._store;
            return model;
        },
        async authenticate() {
            return true;
        },
        async transaction(fn) {
            // Simple passthrough transaction — doesn't simulate locking
            return fn({});
        },
        _models: models,
        _stores: stores,
    };

    return db;
}

/**
 * Creates a mock instance of the Switch plugin for unit testing.
 *
 * @param {object} overrides - {
 *   options?: object,    // Override specific options
 *   players?: object[],  // Initial server.players
 *   admins?: object,     // server.admins (steamID-keyed)
 * }
 * @returns {object} { plugin, server, rcon, database, models }
 */
export async function createMockSwitchPlugin(overrides = {}) {
    const {
        options: optionOverrides = {},
        players: initialPlayers = [],
        admins: initialAdmins = {},
        currentLayer = { name: 'TestLayer', gamemode: 'AAS', classname: 'Test_Class' },
    } = overrides;

    // Build mock server (EventEmitter-based, matches SquadJS)
    const rcon = mockRcon();
    const database = mockDatabase();

    const server = new EventEmitter();
    server.players = [...initialPlayers];
    server.squads = [];
    server.admins = { ...initialAdmins };
    server.currentLayer = currentLayer;
    server.layerHistory = [{ time: Date.now() - 60000 }];

    // Server methods
    server.updatePlayerList = async () => {
        server.emit('UPDATED_PLAYER_INFORMATION', {});
    };
    server.updateSquadList = async () => {
        // No-op for most tests
    };
    server.updateLayerInformation = async () => {
        server.emit('UPDATED_LAYER_INFORMATION', {});
    };

    server.rcon = rcon;

    // Load the Switch class (dynamic import to avoid circular issues)
    const { default: Switch } = await import('../../switch.js');

    // Build options (merge defaults with overrides)
    const testOptions = {
        commandPrefix: '!switch',
        doubleSwitchCommands: ['!bug', '!stuck'],
        doubleSwitchCooldownHours: 0.5,
        doubleSwitchDelaySeconds: 1,
        endMatchSwitchSlots: 3,
        switchCooldownHours: 3,
        switchCooldownMinutes: 0,
        switchEnabledMinutes: 5,
        doubleSwitchEnabledMinutes: 5,
        maxUnbalancedSlots: 3,
        switchToOldTeamAfterRejoin: true,
        discordChannelID: '',
        database: 'test-db',
        discordClient: 'test-discord',
        scrambleLockdownDurationMinutes: 20,
        liberalSwitchGameModes: ['Seed', 'Jensen'],
        liberalSwitchMaxUnbalancedSlots: 6,
        dynamicBalanceTolerance: false,
        dynamicBalancePlayerFloor: 90,
        dynamicBalanceExtraSlots: 2,
        ...optionOverrides,
    };

    // Connectors map — keys match connector names in options, values are the resolved instances
    const connectors = {
        'test-db': database,
        'test-discord': null,
    };

    const plugin = new Switch(server, testOptions, connectors);

    // Call prepareToMount + mount to initialize
    await plugin.prepareToMount();
    await plugin.mount();

    return {
        plugin,
        server,
        rcon,
        database,
        models: database._models,
        stores: database._stores,
    };
}

/**
 * Resets all recorded RCON calls and clears in-memory stores.
 * @param {object} ctx - Context from createMockSwitchPlugin.
 */
export function resetTestContext(ctx) {
    ctx.rcon.resetCalls();
    for (const modelName of Object.keys(ctx.models)) {
        ctx.models[modelName]._store.length = 0;
    }
    ctx.server.players.length = 0;
}

/**
 * Creates a mock CHAT_MESSAGE event payload.
 * @param {object} player - Player object.
 * @param {string} message - Chat message.
 * @param {string} chat - Chat channel (default 'ChatAll').
 * @returns {object} Event payload.
 */
export function mockChatMessage(player, message, chat = 'ChatAll') {
    return {
        chat,
        message,
        name: player.name,
        player: { ...player },
        steamID: player.steamID,
        eosID: player.eosID,
        time: new Date(),
    };
}

/**
 * Creates a mock PLAYER_CONNECTED event payload.
 * @param {object} player - Player object.
 * @returns {object} Event payload.
 */
export function mockPlayerConnected(player) {
    return {
        player: { ...player },
        steamID: player.steamID,
        eosID: player.eosID,
        time: new Date(),
    };
}