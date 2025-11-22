import { Connection, PublicKey } from "@solana/web3.js";

const PYTH_RECEIVER_PROGRAM = new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");

async function findRealDiscriminator() {
    console.log("🔍 Searching for PriceUpdateV2 accounts...\n");

    const connection = new Connection("https://api.mainnet-beta.solana.com");

    try {
        // Find accounts OWNED BY the Pyth Receiver program
        const accounts = await connection.getProgramAccounts(PYTH_RECEIVER_PROGRAM, {
            filters: [
                { dataSize: 134 } // PriceUpdateV2 size
            ],
            dataSlice: { offset: 0, length: 0 }
        });

        if (accounts.length === 0) {
            console.log("❌ No PriceUpdateV2 accounts found");
            return;
        }

        console.log(`✅ Found ${accounts.length} accounts\n`);

        // Use the first account
        const accountAddress = accounts[0].pubkey;
        console.log("📍 Using account:", accountAddress.toBase58(), "\n");

        // Fetch full data
        const accountInfo = await connection.getAccountInfo(accountAddress);

        if (accountInfo) {
            const discriminator = accountInfo.data.subarray(0, 8);

            console.log("🔑 DISCRIMINATOR FOUND:");
            console.log("   Hex:   ", discriminator.toString('hex'));
            console.log("   Base64:", discriminator.toString('base64'));
            console.log("   Array: ", Array.from(discriminator));

            console.log("\n📋 Copy this line into your mock oracle:");
            console.log(`const PRICE_UPDATE_V2_DISCRIMINATOR = Buffer.from([${Array.from(discriminator).join(', ')}]);`);
        }
    } catch (error) {
        console.error("❌ Error:", error);
    }
}

findRealDiscriminator();