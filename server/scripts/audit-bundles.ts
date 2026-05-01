#!/usr/bin/env tsx
/**
 * Retroactive SPK-signature audit for existing DB bundles.
 *
 * Usage (run from the server/ directory):
 *   npm run audit:bundles             # report only
 *   npm run audit:bundles:delete      # delete invalid records
 *
 * Needs DATABASE_URL in .env (loaded automatically).
 * Tables audited: UserKeyBundleV2, Device
 */

import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { createPublicKey, verify } from 'node:crypto';

// ── bundle verification (mirrors src/common/verify-bundle.ts) ────────────────

const BUNDLE_BYTES     = 161;
const ED25519_SPKI_HDR = Buffer.from('302a300506032b6570032100', 'hex');

function decodeB64Url(s: string): Buffer {
    return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function checkBundle(raw: string): { ok: true } | { ok: false; reason: string } {
    try {
        const buf = decodeB64Url(raw);
        if (buf.length !== BUNDLE_BYTES)
            return { ok: false, reason: `bad length: ${buf.length}` };

        const ikSignPub = buf.subarray(0,  32);
        const spkPub    = buf.subarray(64, 96);
        const spkSig    = buf.subarray(96, 160);

        const pub = createPublicKey({
            key:    Buffer.concat([ED25519_SPKI_HDR, ikSignPub]),
            format: 'der',
            type:   'spki',
        });

        return verify(null, spkPub, pub, spkSig)
            ? { ok: true }
            : { ok: false, reason: 'signature mismatch' };
    } catch (e: any) {
        return { ok: false, reason: e.message ?? String(e) };
    }
}

// ── main ─────────────────────────────────────────────────────────────────────

const DELETE_MODE = process.argv.includes('--delete');

async function main() {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
    const prisma  = new PrismaClient({ adapter } as any);

    try {
        const [v2Rows, devRows] = await Promise.all([
            prisma.userKeyBundleV2.findMany({
                select: { id: true, userId: true, bundle: true, updatedAt: true },
            }),
            prisma.device.findMany({
                select: { id: true, userId: true, deviceName: true, bundle: true, createdAt: true },
            }),
        ]);

        // ── UserKeyBundleV2 ──
        console.log(`\n── UserKeyBundleV2 (${v2Rows.length} records) ──`);
        const v2Bad: typeof v2Rows = [];
        for (const row of v2Rows) {
            const r = checkBundle(row.bundle);
            if (!r.ok) {
                console.log(`  INVALID  userId=${row.userId}  id=${row.id}  updatedAt=${row.updatedAt.toISOString()}  reason: ${r.reason}`);
                v2Bad.push(row);
            }
        }
        if (v2Bad.length === 0) console.log('  All valid ✓');

        // ── Device ──
        console.log(`\n── Device bundles (${devRows.length} records) ──`);
        const devBad: typeof devRows = [];
        for (const row of devRows) {
            const r = checkBundle(row.bundle);
            if (!r.ok) {
                console.log(`  INVALID  userId=${row.userId}  deviceId=${row.id}  name="${row.deviceName ?? ''}"  createdAt=${row.createdAt.toISOString()}  reason: ${r.reason}`);
                devBad.push(row);
            }
        }
        if (devBad.length === 0) console.log('  All valid ✓');

        // ── Summary ──
        const anyBad = v2Bad.length + devBad.length;
        console.log('\n── Summary ──');
        console.log(`  UserKeyBundleV2 : ${v2Rows.length - v2Bad.length} / ${v2Rows.length} valid`);
        console.log(`  Device          : ${devRows.length - devBad.length} / ${devRows.length} valid`);

        if (anyBad === 0) {
            console.log('\n  No action needed.');
            return;
        }

        if (!DELETE_MODE) {
            console.log(`\n  ${anyBad} invalid record(s) found. Re-run with --delete to remove them.`);
            return;
        }

        // ── Delete ──
        console.log('\n── Deleting invalid records ──');
        if (v2Bad.length) {
            await prisma.userKeyBundleV2.deleteMany({
                where: { id: { in: v2Bad.map(r => r.id) } },
            });
            console.log(`  Deleted ${v2Bad.length} UserKeyBundleV2 record(s)`);
        }
        if (devBad.length) {
            await prisma.device.deleteMany({
                where: { id: { in: devBad.map(r => r.id) } },
            });
            console.log(`  Deleted ${devBad.length} Device record(s)`);
        }
        console.log('  Done.');
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
