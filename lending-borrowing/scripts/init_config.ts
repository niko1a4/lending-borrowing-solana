import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { LendingBorrowing } from "../target/types/lending_borrowing";


(async () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.LendingBorrowing as Program<LendingBorrowing>;
    const admin = provider.wallet;

    const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("config"), admin.publicKey.toBuffer()],
        program.programId,
    );

    console.log("Config PDA:", configPda.toBase58());

    const tx = await program.methods.initConfig().accounts({
        initializer: admin.publicKey,
    }).rpc();

    console.log("init_config tx:", tx);
})();