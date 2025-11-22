import { Connection, PublicKey } from "@solana/web3.js";
import pkg from "@pythnetwork/pyth-solana-receiver";
const { PriceUpdateV2 } = pkg;

const PYTH_RECEIVER_PROGRAM = new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");

async function findValidOracles() {
    const connection = new Connection("https://api.mainnet-beta.solana.com");

    const accounts = await connection.getProgramAccounts(PYTH_RECEIVER_PROGRAM, {
        filters: [{ dataSize: 134 }],
    });

    console.log(`Found ${accounts.length} oracles`);

    for (const { pubkey, account } of accounts.slice(0, 5)) {
        try {
            const parsed = PriceUpdateV2.parse(account.data);
            console.log("=".repeat(80));
            console.log("Address:", pubkey.toBase58());
            console.log("Price:", parsed.price.price, "Exponent:", parsed.price.exponent);
            console.log("Publish time:", new Date(parsed.price.publish_time * 1000).toISOString());
        } catch (e) {
            // Some may fail if data doesn't match expected layout
        }
    }
}

findValidOracles().catch(console.error);
