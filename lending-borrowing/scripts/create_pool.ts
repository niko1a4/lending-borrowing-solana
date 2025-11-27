import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { LendingBorrowing } from "../target/types/lending_borrowing";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";


(async () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.LendingBorrowing as Program<LendingBorrowing>;
    const admin = provider.wallet;

    const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("config"), admin.publicKey.toBuffer()],
        program.programId,
    );

    const oracle = new PublicKey("7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE");
    const feedId = Array.from(Buffer.from("ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d", "hex"));

    const liquidation_treshold_bps = 8000; // 80%
    const ltv_bps = 7500; // 75%
    const liquidation_bonus_bps = 500; // 5%
    const close_factor_bps = 5000; // 50%
    const base_rate = new anchor.BN("10000000000000000"); // 1% 
    const slope1 = new anchor.BN("30000000000000000");
    const slope2 = new anchor.BN("90000000000000000");
    const optimal_utilization = new anchor.BN("800000000000000000");

    const underlyingMint = new PublicKey("So11111111111111111111111111111111111111112");

    const [poolPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), configPda.toBuffer(), underlyingMint.toBuffer()],
        program.programId,
    );
    console.log("Pool PDA:", poolPda.toBase58());

    const dtokenMint = Keypair.generate();
    const vault = getAssociatedTokenAddressSync(
        underlyingMint,
        poolPda,
        true
    );
    console.log("dToken Mint:", dtokenMint.publicKey.toBase58());
    console.log("Vault:", vault.toBase58());
    console.log("Config PDA:", configPda.toBase58());
    const tx = await program.methods.createPool(
        oracle,
        feedId,
        liquidation_treshold_bps,
        ltv_bps,
        liquidation_bonus_bps,
        close_factor_bps,
        base_rate,
        slope1,
        slope2,
        optimal_utilization
    ).accountsPartial({
        admin: admin.publicKey,
        mint: underlyingMint,
        config: configPda,
        dtokenMint: dtokenMint.publicKey,
        pool: poolPda,
        vault: vault,
    }).signers([dtokenMint]).rpc();

    console.log("create_pool tx:", tx);
    console.log("\nPool created successfully!");
})();