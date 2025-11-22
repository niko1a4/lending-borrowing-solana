import { writeFileSync } from 'fs';
import { PublicKey } from '@solana/web3.js';

function createMockPriceUpdateAccount(price: number = 240.50) {
    // According to Pyth SDK, the structure after discriminator is:
    // - write_authority: Pubkey (32 bytes)
    // - verification_level: VerificationLevel enum (serialized as 1 byte for variant + optional data)
    // - price_message: PriceMessage struct (inline, not pointer)
    // - posted_slot: u64 (8 bytes)

    const data = Buffer.alloc(200); // Allocate more to be safe
    let offset = 0;

    // Discriminator (8 bytes) - from Anchor IDL for PriceUpdateV2
    const discriminator = [34, 241, 35, 99, 157, 126, 244, 205];
    discriminator.forEach(b => data.writeUInt8(b, offset++));

    // Write authority (32 bytes)
    const dummyPubkey = new PublicKey("11111111111111111111111111111111");
    dummyPubkey.toBuffer().copy(data, offset);
    offset += 32;

    // VerificationLevel enum - this is the key!
    // enum VerificationLevel {
    //   Partial { num_signatures: u8 },  // variant 0
    //   Full { num_signatures: u8 },     // variant 1
    // }
    // Anchor serializes enums as: 1 byte for variant index + data

    data.writeUInt8(1, offset++);  // Variant 1 = Full (more trusted)
    data.writeUInt8(5, offset++);  // num_signatures = 5 (higher number)

    // PriceMessage struct (Anchor serializes structs inline)
    // Feed ID (32 bytes)
    const feedId = [
        0xef, 0x0d, 0x8b, 0x6f, 0xda, 0x2c, 0xeb, 0xa4,
        0x1d, 0xa1, 0x5d, 0x40, 0x95, 0xd1, 0xda, 0x39,
        0x2a, 0x0d, 0x2f, 0x8e, 0xd0, 0xc6, 0xc7, 0xbc,
        0x0f, 0x4c, 0xfa, 0xc8, 0xc2, 0x80, 0xb5, 0x6d
    ];
    Buffer.from(feedId).copy(data, offset);
    offset += 32;

    // Price (i64, 8 bytes)
    const priceValue = BigInt(Math.floor(price * 100000000));
    data.writeBigInt64LE(priceValue, offset);
    offset += 8;

    // Conf (u64, 8 bytes)
    data.writeBigUInt64LE(100000n, offset);
    offset += 8;

    // Exponent (i32, 4 bytes)
    data.writeInt32LE(-8, offset);
    offset += 4;

    // Publish time (i64, 8 bytes)
    const now = BigInt(Math.floor(Date.now() / 1000));
    data.writeBigInt64LE(now, offset);
    offset += 8;

    // Prev publish time (i64, 8 bytes)
    data.writeBigInt64LE(now - 10n, offset);
    offset += 8;

    // EMA price (i64, 8 bytes)
    data.writeBigInt64LE(priceValue, offset);
    offset += 8;

    // EMA conf (u64, 8 bytes)
    data.writeBigUInt64LE(100000n, offset);
    offset += 8;

    // Posted slot (u64, 8 bytes)
    data.writeBigUInt64LE(0n, offset); // Set to 0 for mock
    offset += 8;

    console.log('Total size:', offset, 'bytes');

    // Trim to actual size
    const trimmedData = data.slice(0, offset);

    // Create account JSON
    const pythProgramId = "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ";
    const accountJson = {
        pubkey: "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE",
        account: {
            lamports: 1000000000,
            data: [trimmedData.toString('base64'), 'base64'],
            owner: pythProgramId,
            executable: false,
            rentEpoch: 0
        }
    };

    writeFileSync('tests/fixtures/mock-oracle.json', JSON.stringify(accountJson, null, 2));
    console.log('✅ Created mock oracle account file');
    console.log('   Price: $' + price);
    console.log('   Verification: Partial with 3 signatures');
}

createMockPriceUpdateAccount(240.50);