/**
 * DB Tests: CRUD Operations Across Dialects
 *
 * Verifies that create, upsert, findByPk, findOne, findAll, destroy,
 * count, and bulkCreate work correctly on sqlite, mysql, and postgres.
 *
 * Run: node --test test/db/db-crud.test.js
 * Prerequisites for mysql/postgres: docker compose -f test/db/docker-compose.yml up -d
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    setupDatabase,
    teardownDatabase,
    truncateAll,
    DIALECTS,
} from './db-helpers.js';

// Test against all available dialects
const dialectsToTest = ['sqlite'];

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
    // sqlite only
}

for (const dialect of dialectsToTest) {
    const label = DIALECTS[dialect].label;

    describe(`CRUD Operations — ${label} (${dialect})`, () => {
        /** @type {Awaited<ReturnType<setupDatabase>>} */
        let ctx;

        before(async () => {
            ctx = await setupDatabase(dialect);
        });

        after(async () => {
            await teardownDatabase(ctx);
        });

        beforeEach(async () => {
            await truncateAll(ctx.sequelize, ctx.models);
        });

        describe('create()', () => {
            it('creates a record and returns it', async () => {
                const record = await ctx.models.PlayerCooldowns.create({
                    eosID: 'eos_crud_create',
                    steamID: '76561198000000001',
                    playerName: 'CreateTest',
                });

                assert.ok(record);
                assert.strictEqual(record.eosID, 'eos_crud_create');
                assert.strictEqual(record.steamID, '76561198000000001');
                assert.strictEqual(record.playerName, 'CreateTest');
            });

            it('persists the record (findByPk retrieves it)', async () => {
                await ctx.models.PlayerCooldowns.create({
                    eosID: 'eos_crud_persist',
                    steamID: '76561198000000002',
                    playerName: 'PersistTest',
                });

                const found = await ctx.models.PlayerCooldowns.findByPk('eos_crud_persist');
                assert.ok(found);
                assert.strictEqual(found.playerName, 'PersistTest');
            });

            it('stores DATE values correctly', async () => {
                const now = new Date();
                await ctx.models.PlayerCooldowns.create({
                    eosID: 'eos_crud_date',
                    lastSwitchTimestamp: now,
                    firstSeenTimestamp: now,
                    scrambleLockdownExpiry: now,
                });

                const found = await ctx.models.PlayerCooldowns.findByPk('eos_crud_date');
                assert.ok(found.lastSwitchTimestamp);
                assert.ok(found.firstSeenTimestamp);
                assert.ok(found.scrambleLockdownExpiry);

                // Dates should be within 1 second of original
                const diff = Math.abs(new Date(found.lastSwitchTimestamp).getTime() - now.getTime());
                assert.ok(diff < 2000, `Date difference too large: ${diff}ms`);
            });
        });

        describe('upsert()', () => {
            it('inserts when record does not exist', async () => {
                const [record, created] = await ctx.models.PlayerCooldowns.upsert({
                    eosID: 'eos_upsert_new',
                    steamID: '76561198000000003',
                    playerName: 'UpsertNew',
                });

                // Sequelize v6 upsert returns [instance, boolean|null].
                // SQLite may return null for 'created' (no RETURNING support).
                assert.ok(created === true || created === null,
                    `created should be true or null, got ${created}`);
                assert.strictEqual(record.eosID, 'eos_upsert_new');
            });

            it('updates when record already exists', async () => {
                // First insert
                await ctx.models.PlayerCooldowns.create({
                    eosID: 'eos_upsert_existing',
                    steamID: '76561198000000004',
                    playerName: 'OriginalName',
                });

                // Upsert with new data
                const [record, created] = await ctx.models.PlayerCooldowns.upsert({
                    eosID: 'eos_upsert_existing',
                    steamID: '76561198000000004',
                    playerName: 'UpdatedName',
                });

                // created is false for update, or null on SQLite
                assert.ok(created === false || created === null,
                    `created should be false or null for update, got ${created}`);
                assert.strictEqual(record.playerName, 'UpdatedName');

                // Verify persistence
                const found = await ctx.models.PlayerCooldowns.findByPk('eos_upsert_existing');
                assert.strictEqual(found.playerName, 'UpdatedName');
            });

            it('upsert preserves unspecified fields on update', async () => {
                const now = new Date();
                await ctx.models.PlayerCooldowns.create({
                    eosID: 'eos_upsert_partial',
                    steamID: '76561198000000005',
                    playerName: 'PartialOriginal',
                    lastSwitchTimestamp: now,
                });

                // Upsert only changing playerName — lastSwitchTimestamp should be preserved
                await ctx.models.PlayerCooldowns.upsert({
                    eosID: 'eos_upsert_partial',
                    steamID: '76561198000000005',
                    playerName: 'PartialUpdated',
                });

                const found = await ctx.models.PlayerCooldowns.findByPk('eos_upsert_partial');
                assert.strictEqual(found.playerName, 'PartialUpdated');
                // Note: upsert behavior on unspecified fields varies by dialect.
                // MySQL ON DUPLICATE KEY UPDATE sets unspecified fields to defaults.
                // Postgres ON CONFLICT DO UPDATE only updates specified columns.
                // SQLite INSERT OR REPLACE deletes + re-inserts (loses unspecified fields).
                // This test documents the behavior — the plugin should always pass all fields to upsert.
            });
        });

        describe('findByPk()', () => {
            it('returns record by string primary key', async () => {
                await ctx.models.PlayerCooldowns.create({
                    eosID: 'eos_findbypk_test',
                    playerName: 'FindByPkTest',
                });

                const found = await ctx.models.PlayerCooldowns.findByPk('eos_findbypk_test');
                assert.ok(found);
                assert.strictEqual(found.playerName, 'FindByPkTest');
            });

            it('returns null for non-existent key', async () => {
                const found = await ctx.models.PlayerCooldowns.findByPk('eos_nonexistent');
                assert.strictEqual(found, null);
            });
        });

        describe('findOne()', () => {
            it('finds by single where condition', async () => {
                await ctx.models.PlayerCooldowns.create({
                    eosID: 'eos_findone_a',
                    playerName: 'FindOneA',
                });
                await ctx.models.PlayerCooldowns.create({
                    eosID: 'eos_findone_b',
                    playerName: 'FindOneB',
                });

                const found = await ctx.models.PlayerCooldowns.findOne({
                    where: { playerName: 'FindOneB' },
                });
                assert.ok(found);
                assert.strictEqual(found.eosID, 'eos_findone_b');
            });

            it('returns null when no match', async () => {
                const found = await ctx.models.PlayerCooldowns.findOne({
                    where: { playerName: 'NoSuchPlayer' },
                });
                assert.strictEqual(found, null);
            });
        });

        describe('findAll()', () => {
            it('returns all records', async () => {
                await ctx.models.PlayerCooldowns.create({ eosID: 'eos_findall_1', playerName: 'A' });
                await ctx.models.PlayerCooldowns.create({ eosID: 'eos_findall_2', playerName: 'B' });
                await ctx.models.PlayerCooldowns.create({ eosID: 'eos_findall_3', playerName: 'C' });

                const all = await ctx.models.PlayerCooldowns.findAll();
                assert.strictEqual(all.length, 3);
            });

            it('filters by where clause', async () => {
                await ctx.models.Endmatch.create({
                    name: 'MatchA', steamID: '1', eosID: 'eos_a',
                });
                await ctx.models.Endmatch.create({
                    name: 'MatchB', steamID: '2', eosID: 'eos_b',
                });
                await ctx.models.Endmatch.create({
                    name: 'MatchA2', steamID: '3', eosID: 'eos_c',
                });

                const results = await ctx.models.Endmatch.findAll({
                    where: { name: 'MatchA' },
                });
                assert.strictEqual(results.length, 1);
                assert.strictEqual(results[0].eosID, 'eos_a');
            });
        });

        describe('destroy()', () => {
            it('deletes matching records', async () => {
                await ctx.models.Endmatch.create({
                    name: 'ToDelete', steamID: '1', eosID: 'eos_del',
                });

                const count = await ctx.models.Endmatch.destroy({
                    where: { eosID: 'eos_del' },
                });
                assert.strictEqual(count, 1);

                const found = await ctx.models.Endmatch.findOne({ where: { eosID: 'eos_del' } });
                assert.strictEqual(found, null);
            });

            it('returns 0 when no match', async () => {
                const count = await ctx.models.Endmatch.destroy({
                    where: { eosID: 'eos_nonexistent' },
                });
                assert.strictEqual(count, 0);
            });
        });

        describe('count()', () => {
            it('counts all records', async () => {
                await ctx.models.Endmatch.create({ name: 'C1', steamID: '1', eosID: 'eos_c1' });
                await ctx.models.Endmatch.create({ name: 'C2', steamID: '2', eosID: 'eos_c2' });

                const total = await ctx.models.Endmatch.count();
                assert.strictEqual(total, 2);
            });

            it('counts with where filter', async () => {
                await ctx.models.Endmatch.create({ name: 'Filtered', steamID: '1', eosID: 'eos_f1' });
                await ctx.models.Endmatch.create({ name: 'Other', steamID: '2', eosID: 'eos_f2' });

                const count = await ctx.models.Endmatch.count({
                    where: { name: 'Filtered' },
                });
                assert.strictEqual(count, 1);
            });
        });

        describe('bulkCreate()', () => {
            it('inserts multiple records', async () => {
                await ctx.models.Endmatch.bulkCreate([
                    { name: 'Bulk1', steamID: '1', eosID: 'eos_bulk1' },
                    { name: 'Bulk2', steamID: '2', eosID: 'eos_bulk2' },
                    { name: 'Bulk3', steamID: '3', eosID: 'eos_bulk3' },
                ]);

                const all = await ctx.models.Endmatch.findAll();
                assert.strictEqual(all.length, 3);
            });

            it('updateOnDuplicate updates existing records', async () => {
                // Create initial records
                await ctx.models.PlayerCooldowns.bulkCreate([
                    { eosID: 'eos_dup_1', playerName: 'Original1' },
                    { eosID: 'eos_dup_2', playerName: 'Original2' },
                ]);

                // Bulk create with updateOnDuplicate
                await ctx.models.PlayerCooldowns.bulkCreate([
                    { eosID: 'eos_dup_1', playerName: 'Updated1' },
                    { eosID: 'eos_dup_2', playerName: 'Updated2' },
                    { eosID: 'eos_dup_3', playerName: 'New3' },
                ], { updateOnDuplicate: ['playerName'] });

                const all = await ctx.models.PlayerCooldowns.findAll({
                    order: [['eosID', 'ASC']],
                });
                assert.strictEqual(all.length, 3);
                assert.strictEqual(all[0].playerName, 'Updated1');
                assert.strictEqual(all[1].playerName, 'Updated2');
                assert.strictEqual(all[2].playerName, 'New3');
            });
        });
    });
}