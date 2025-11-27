import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, Idl } from '@coral-xyz/anchor';
import { DataSource } from 'typeorm';
import { PoolEntity } from '../pools/entities/pool.entity';
import * as idlJson from '../../../lending-borrowing/target/idl/lending_borrowing.json';

async function backfillPools() {
    console.log('Starting pool backfill...');

    const rpcUrl = process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    const provider = new AnchorProvider(
        connection,
        {} as any,
        { commitment: 'confirmed' }
    );
    const programId = new PublicKey(process.env.PROGRAM_ID!);
    const program = new Program(idlJson as Idl, provider);

    console.log(`Fetching pools from program: ${programId.toString()}`);

    const pools = await (program.account as any).pool.all();
    console.log(`Found ${pools.length} pools on-chain`);

    const dataSource = new DataSource({
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        username: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || 'lending-borrowing',
        database: process.env.DB_NAME || 'lending-borrowing',
        entities: [PoolEntity],
        synchronize: false,
    });

    await dataSource.initialize();
    console.log('Database connected');

    const poolRepository = dataSource.getRepository(PoolEntity);

    for (const poolAccount of pools) {
        const poolPubkey = poolAccount.publicKey.toBase58();
        const poolData = poolAccount.account as any;

        console.log(`Processing pool: ${poolPubkey}`);
        console.log(`  Mint: ${poolData.mint.toBase58()}`);

        // Check if pool already exists
        const existingPool = await poolRepository.findOne({
            where: { pool: poolPubkey }
        });

        if (existingPool) {
            console.log(`  Pool already exists in database, skipping...`);
            continue;
        }

        // Insert new pool
        const newPool = poolRepository.create({
            pool: poolPubkey,
            mint: poolData.mint.toBase58(),
            timestamp: Date.now(),
        });

        await poolRepository.save(newPool);
        console.log(`Pool saved to database`);
    }
    await dataSource.destroy();
    console.log('\nBackfill complete!');
    console.log(`Total pools processed: ${pools.length}`);
}

backfillPools().then(() => process.exit(0)).catch((error) => {
    console.error('Error during backfill:', error);
    process.exit(1);
});