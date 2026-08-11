/**
 * DB Tests: Schema Sync & Column Verification
 *
 * Verifies that sync({alter: true}) creates the correct tables and columns
 * across all three Sequelize dialects (sqlite, mysql, postgres).
 *
 * Run: node --test test/db/db-schema.test.js
 * Prerequisites for mysql/postgres: docker compose -f test/db/docker-compose.yml up -d
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
    setupDatabase,
    teardownDatabase,
    DIALECTS,
} from './db-helpers.js';

// Test against all available dialects
const dialectsToTest = ['sqlite'];

// Only add mysql/postgres if Docker containers are available
try {
    const net = await import('node:net');
    for (const [dialect, config] of Object.entries(DIALECTS)) {
        if (dialect === 'sqlite') continue;
        const opts = config.getOptions();
        const sock = await new Promise((resolve) => {
            const s = new net.Socket();
            s.setTimeout(2000);
            s.on('connect', () => { s.destroy(); resolve(true); });
            s.on('error', () => resolve(false));
            s.on('timeout', () => { s.destroy(); resolve(false); });
            s.connect(opts.port, opts.host);
        });
        if (sock) dialectsToTest.push(dialect);
    }
} catch {
    // net module not available or connection check failed — sqlite only
}

for (const dialect of dialectsToTest) {
    const label = DIALECTS[dialect].label;

    describe(`Schema Sync — ${label} (${dialect})`, () => {
        /** @type {Awaited<ReturnType<setupDatabase>>} */
        let ctx;

        before(async () => {
            ctx = await setupDatabase(dialect);
        });

        after(async () => {
            await teardownDatabase(ctx);
        });

        describe('Endmatch table', () => {
            it('has all expected columns', async () => {
                const tableInfo = await ctx.sequelize.getQueryInterface().describeTable('SwitchPlugin_Endmatch');

                assert.ok(tableInfo.id, 'Should have id column');
                assert.ok(tableInfo.name, 'Should have name column');
                assert.ok(tableInfo.steamID, 'Should have steamID column');
                assert.ok(tableInfo.eosID, 'Should have eosID column');
                assert.ok(tableInfo.created_at, 'Should have created_at column');
            });

            it('id is auto-incrementing primary key', async () => {
                const tableInfo = await ctx.sequelize.getQueryInterface().describeTable('SwitchPlugin_Endmatch');

                assert.ok(tableInfo.id.primaryKey, 'id should be primary key');
                // Sequelize describeTable may not expose autoIncrement/defaultValue
                // on all dialects (SQLite in particular). The behavioral test
                // 'id auto-increments on insert' below verifies actual behavior.
            });

            it('id auto-increments on insert', async () => {
                await ctx.models.Endmatch.create({
                    name: 'Player1',
                    steamID: '76561198000000001',
                    eosID: 'eos_schema_test_1',
                });
                await ctx.models.Endmatch.create({
                    name: 'Player2',
                    steamID: '76561198000000002',
                    eosID: 'eos_schema_test_2',
                });

                const records = await ctx.models.Endmatch.findAll({ order: [['id', 'ASC']] });
                assert.strictEqual(records.length, 2);
                assert.strictEqual(records[0].id, 1);
                assert.strictEqual(records[1].id, 2);
            });

            it('created_at defaults to current timestamp', async () => {
                const before = new Date();
                await ctx.models.Endmatch.create({
                    name: 'TimestampTest',
                    steamID: '76561198000000003',
                    eosID: 'eos_ts_test',
                });
                const after = new Date();

                const record = await ctx.models.Endmatch.findOne({ where: { eosID: 'eos_ts_test' } });
                assert.ok(record.created_at, 'created_at should be set');
                const ts = new Date(record.created_at).getTime();
                assert.ok(ts >= before.getTime() - 1000, 'created_at should be >= before');
                assert.ok(ts <= after.getTime() + 1000, 'created_at should be <= after');
            });
        });

        describe('PlayerCooldowns table', () => {
            it('has all expected columns', async () => {
                const tableInfo = await ctx.sequelize.getQueryInterface().describeTable('SwitchPlugin_PlayerCooldowns');

                assert.ok(tableInfo.eosID, 'Should have eosID column');
                assert.ok(tableInfo.steamID, 'Should have steamID column');
                assert.ok(tableInfo.playerName, 'Should have playerName column');
                assert.ok(tableInfo.lastSwitchTimestamp, 'Should have lastSwitchTimestamp column');
                assert.ok(tableInfo.firstSeenTimestamp, 'Should have firstSeenTimestamp column');
                assert.ok(tableInfo.scrambleLockdownExpiry, 'Should have scrambleLockdownExpiry column');
            });

            it('eosID is primary key', async () => {
                const tableInfo = await ctx.sequelize.getQueryInterface().describeTable('SwitchPlugin_PlayerCooldowns');

                assert.ok(tableInfo.eosID.primaryKey, 'eosID should be primary key');
                assert.ok(!tableInfo.eosID.allowNull || tableInfo.eosID.allowNull === false,
                    'eosID should not allow null');
            });

            it('eosID enforces uniqueness', async () => {
                await ctx.models.PlayerCooldowns.create({
                    eosID: 'eos_pk_test',
                    steamID: '76561198000000001',
                    playerName: 'PKTest',
                });

                await assert.rejects(
                    async () => {
                        await ctx.models.PlayerCooldowns.create({
                            eosID: 'eos_pk_test',
                            steamID: '76561198000000002',
                            playerName: 'PKTestDuplicate',
                        });
                    },
                    /(UNIQUE|unique|Duplicate|SQLITE_CONSTRAINT|duplicate key)/i,
                    'Should reject duplicate eosID'
                );
            });

            it('nullable columns accept null values', async () => {
                await ctx.models.PlayerCooldowns.create({
                    eosID: 'eos_nullable_test',
                    steamID: null,
                    playerName: null,
                    lastSwitchTimestamp: null,
                    firstSeenTimestamp: null,
                    scrambleLockdownExpiry: null,
                });

                const record = await ctx.models.PlayerCooldowns.findByPk('eos_nullable_test');
                assert.ok(record, 'Record should exist');
                assert.strictEqual(record.steamID, null);
                assert.strictEqual(record.playerName, null);
                assert.strictEqual(record.lastSwitchTimestamp, null);
                assert.strictEqual(record.firstSeenTimestamp, null);
                assert.strictEqual(record.scrambleLockdownExpiry, null);
            });
        });

        describe('sync({alter: true}) idempotency', () => {
            it('running sync twice does not error', async () => {
                // First sync already happened in setupDatabase
                // Second sync should be a no-op
                await ctx.sequelize.sync({ alter: true });

                // Verify tables still exist and are queryable
                const endmatchCount = await ctx.models.Endmatch.count();
                const cooldownsCount = await ctx.models.PlayerCooldowns.count();
                assert.ok(typeof endmatchCount === 'number');
                assert.ok(typeof cooldownsCount === 'number');
            });

            it('adding a record after re-sync works', async () => {
                await ctx.sequelize.sync({ alter: true });

                await ctx.models.Endmatch.create({
                    name: 'AfterResync',
                    steamID: '76561198000000099',
                    eosID: 'eos_resync_test',
                });

                const record = await ctx.models.Endmatch.findOne({ where: { eosID: 'eos_resync_test' } });
                assert.ok(record);
                assert.strictEqual(record.name, 'AfterResync');
            });
        });
    });
}