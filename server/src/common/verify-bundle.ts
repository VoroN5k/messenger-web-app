import { createPublicKey, verify } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';

// Wire format (both v2 identity and v3 device bundles):
//   ik_sign_pub(32) || ik_dh_pub(32) || spk_pub(32) || spk_sig(64) || opk_flag(1) = 161 bytes
//
// spk_sig is an Ed25519 signature of spk_pub bytes by ik_sign_pub.
// Rejecting a malformed bundle here prevents a poisoned X3DH key exchange
// where a MITM substitutes an unsigned SPK.

const BUNDLE_BYTES = 161;

// DER/SPKI wrapper for a raw 32-byte Ed25519 public key (RFC 8410).
const ED25519_SPKI_HEADER = Buffer.from('302a300506032b6570032100', 'hex');

function decodeB64Url(s: string): Buffer {
    return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export function verifyKeyBundle(bundleB64url: string): void {
    const bundle = decodeB64Url(bundleB64url);

    if (bundle.length !== BUNDLE_BYTES) {
        throw new BadRequestException(
            `Invalid bundle length: expected ${BUNDLE_BYTES}, got ${bundle.length}`,
        );
    }

    const ikSignPub = bundle.subarray(0, 32);   // Ed25519 verifying key
    const spkPub    = bundle.subarray(64, 96);  // X25519 signed prekey (message being verified)
    const spkSig    = bundle.subarray(96, 160); // Ed25519 signature

    let publicKey: ReturnType<typeof createPublicKey>;
    try {
        publicKey = createPublicKey({
            key:    Buffer.concat([ED25519_SPKI_HEADER, ikSignPub]),
            format: 'der',
            type:   'spki',
        });
    } catch {
        throw new BadRequestException('Invalid identity signing key in bundle');
    }

    const valid = verify(null, spkPub, publicKey, spkSig);
    if (!valid) {
        throw new BadRequestException('Bundle signature verification failed');
    }
}
