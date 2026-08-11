/**
 * Real-DB Test Helpers
 *
 * Creates real Sequelize instances for sqlite (in-memory), mysql, and postgres.
 * Defines the same models the Switch plugin uses (Endmatch, PlayerCooldowns)
 * and provides cleanup utilities.
 *
 * Prerequisites:
 *   - sqlite: no setup needed (uses :memory:)
 *   - mysql:  docker compose -f test/db/docker-compose.yml up -d
 *   - postgres: docker compose -f test/db/docker-compose.yml up -d
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import the REAL Sequelize from the parent SquadJS installation,
// bypassing the local test shim at node_modules/sequelize/index.js.
const squadJsRoot = join(__dirname, '..', '..', '..');
const squadJsRequire = createRequire(join(squadJsRoot, 'package.json'));
const Sequelize = squadJsRequire('sequelize');

const { DataTypes } = Sequelize;

/**
 * Dialect configuration map.
 * Each entry provides the Sequelize constructor options and a display label.
 */
export const DIALECTS = {
    sqlite: {
        label: 'SQLite',
        getOptions() {
            return {
                dialect: 'sqlite',
                storage: ':memory:',
                logging: false,
            };
        },
    },
    mysql: {
        label: 'MySQL',
        getOptions() {
            return {
                dialect: 'mysql',
                host: process.env.MYSQL_HOST || '127.0.0.1',
                port: parseInt(process.env.MYSQL_PORT || '3307', 10),
                database: process.env.MYSQL_DATABASE || 'squadjs_test',
                username: process.env.MYSQL_USER || 'squadjs',
                password: process.env.MYSQL_PASSWORD || 'squadjs_test',
                logging: false,
            };
        },
    },
    postgres: {
        label: 'PostgreSQL',
        getOptions() {
            return {
                dialect: 'postgres',
                host: process.env.POSTGRES_HOST || '127.0.0.1',
                port: parseInt(process.env.POSTGRES_PORT || '5433', 10),
                database: process.env.POSTGRES_DATABASE || 'squadjs_test',
                username: process.env.POSTGRES_USER || 'squadjs',
                password: process.env.POSTGRES_PASSWORD || 'squadjs_test',
                logging: false,
            };
        },
    },
};

/**
 * Creates a Sequelize instance for the given dialect.
 * @param {'sqlite'|'mysql'|'postgres'} dialect
 * @returns {Sequelize}
 */
export function createSequelize(dialect) {
    const config = DIALECTS[dialect];
    if (!config) throw new Error(`Unknown dialect: ${dialect}`);
    return new Sequelize(config.getOptions());
}

/**
 * Defines the Switch plugin models on a Sequelize instance.
 * Mirrors the schemas in switch.js lines 190-237.
 * @param {Sequelize} sequelize
 * @returns {{ Endmatch: object, PlayerCooldowns: object }}
 */
export function defineModels(sequelize) {
    const Endmatch = sequelize.define('SwitchPlugin_Endmatch', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        name: {
            type: DataTypes.STRING,
        },
        steamID: {
            type: DataTypes.STRING,
        },
        eosID: {
            type: DataTypes.STRING,
        },
        created_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
    }, {
        timestamps: false,
        tableName: 'SwitchPlugin_Endmatch',
    });

    const PlayerCooldowns = sequelize.define('SwitchPlugin_PlayerCooldowns', {
        eosID: {
            type: DataTypes.STRING,
            primaryKey: true,
            allowNull: false,
        },
        steamID: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        playerName: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        lastSwitchTimestamp: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        firstSeenTimestamp: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        scrambleLockdownExpiry: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    }, {
        timestamps: false,
        tableName: 'SwitchPlugin_PlayerCooldowns',
    });

    return { Endmatch, PlayerCooldowns };
}

/**
 * Syncs all models with the database.
 * Uses { alter: true } to match the plugin's mount() behavior.
 * @param {Sequelize} sequelize
 */
export async function syncModels(sequelize) {
    await sequelize.sync({ alter: true });
}

/**
 * Drops all tables and closes the connection.
 * @param {Sequelize} sequelize
 */
export async function cleanupDatabase(sequelize) {
    await sequelize.drop();
    await sequelize.close();
}

/**
 * Full setup: create instance, define models, sync.
 * @param {'sqlite'|'mysql'|'postgres'} dialect
 * @returns {Promise<{ sequelize: Sequelize, models: { Endmatch, PlayerCooldowns }, dialect: string }>}
 */
export async function setupDatabase(dialect) {
    const sequelize = createSequelize(dialect);
    const models = defineModels(sequelize);
    await syncModels(sequelize);
    return { sequelize, models, dialect };
}

/**
 * Full teardown: drop tables and close connection.
 * @param {{ sequelize: Sequelize }} ctx
 */
export async function teardownDatabase({ sequelize }) {
    await cleanupDatabase(sequelize);
}

/**
 * Truncates all tables between tests (faster than drop + recreate).
 * @param {Sequelize} sequelize
 * @param {object} models
 */
export async function truncateAll(sequelize, models) {
    // Use destroy({where:{}}) instead of truncate:true to avoid implicit
    // transaction nesting issues on SQLite (which doesn't support nested
    // transactions). Auto-increment counters may not reset, but test data
    // uses unique IDs so this doesn't matter.
    for (const model of Object.values(models)) {
        await model.destroy({ where: {} });
    }
}
