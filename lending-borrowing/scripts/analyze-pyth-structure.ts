import { Connection, PublicKey } from '@solana/web3.js';
import { writeFileSync } from 'fs';

async function analyzePythAccount() {
    const connection = new Connection('https://api.mainnet-beta.solana.com');

    // This is a known Pyth receiver program account - we need to find a recent PriceUpdateV2
    // Let's try to find one by looking at recent transactions

    const pythProgram = new PublicKey('rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ');

    console.log('Fetching recent transactions...');
    const signatures = await connection.getSignaturesForAddress(pythProgram, { limit: 10 });

    console.log(`Found ${signatures.length} recent transactions`);

    for (const sig of signatures) {
        try {
            const tx = await connection.getTransaction(sig.signature, {
                maxSupportedTransactionVersion: 0
            });

            if (tx && tx.meta) {
                // Look for newly created accounts
                const postBalances = tx.meta.postBalances;
                const preBalances = tx.meta.preBalances;

                for (let i = 0; i < postBalances.length; i++) {
                    if (preBalances[i] === 0 && postBalances[i] > 0) {
                        const accountKey = tx.transaction.message.staticAccountKeys[i];
                        console.log('Found new account:', accountKey.toBase58());

                        // Fetch the account data
                        const accountInfo = await connection.getAccountInfo(accountKey);
                        if (accountInfo && accountInfo.owner.equals(pythProgram)) {
                            console.log('\n=== FOUND PYTH PRICE UPDATE ACCOUNT ===');
                            console.log('Address:', accountKey.toBase58());
                            console.log('Data length:', accountInfo.data.length);
                            console.log('Owner:', accountInfo.owner.toBase58());

                            // Analyze the structure
                            const data = accountInfo.data;
                            let offset = 0;

                            console.log('\n=== STRUCTURE ANALYSIS ===');
                            console.log('Discriminator (8 bytes):', Array.from(data.slice(0, 8)));
                            offset += 8;

                            console.log('Write authority (32 bytes):', data.slice(offset, offset + 32).toString('hex'));
                            offset += 32;

                            console.log('Verification level byte:', data[offset]);
                            console.log('Num signatures byte:', data[offset + 1]);
                            offset += 2;

                            console.log('Feed ID (32 bytes):', Array.from(data.slice(offset, offset + 32)));
                            offset += 32;

                            console.log('EMA conf (8 bytes):', data.readBigUInt64LE(offset).toString());
                            offset += 8;

                            console.log('EMA price (8 bytes):', data.readBigInt64LE(offset).toString());
                            offset += 8;

                            console.log('Price (8 bytes):', data.readBigInt64LE(offset).toString());
                            offset += 8;

                            console.log('Conf (8 bytes):', data.readBigUInt64LE(offset).toString());
                            offset += 8;

                            console.log('Exponent (4 bytes):', data.readInt32LE(offset));
                            offset += 4;

                            console.log('Prev publish time (8 bytes):', data.readBigInt64LE(offset).toString());
                            offset += 8;

                            console.log('Publish time (8 bytes):', data.readBigInt64LE(offset).toString());
                            offset += 8;

                            console.log('\nTotal bytes read:', offset);
                            console.log('Remaining bytes:', data.length - offset);

                            // Save to file
                            const accountJson = {
                                pubkey: accountKey.toBase58(),
                                account: {
                                    lamports: accountInfo.lamports,
                                    data: [data.toString('base64'), 'base64'],
                                    owner: accountInfo.owner.toBase58(),
                                    executable: accountInfo.executable,
                                    rentEpoch: accountInfo.rentEpoch
                                }
                            };

                            writeFileSync('tests/fixtures/real-pyth-account.json', JSON.stringify(accountJson, null, 2));
                            console.log('\n✅ Saved to real-pyth-account.json');

                            return; // Stop after finding first one
                        }
                    }
                }
            }
        } catch (e) {
            console.log('Error processing transaction:', e);
        }
    }

    console.log('No PriceUpdateV2 accounts found in recent transactions');
}

analyzePythAccount().catch(console.error);