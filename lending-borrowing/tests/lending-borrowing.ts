import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, web3, BN } from "@coral-xyz/anchor";
import {
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  createMint,
  getAccount,
  getMint,
  mintTo,
} from "@solana/spl-token";
import { LendingBorrowing } from "../target/types/lending_borrowing";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

describe("lending-borrowing", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.lendingBorrowing as Program<LendingBorrowing>;

  const admin = provider.wallet;
  let mintX: PublicKey;
  let dTokenMint: Keypair;
  //PDAs
  let poolPda: PublicKey;
  let configPda: PublicKey;
  let vaultAta: PublicKey;

  //CONSTS
  const LIQUIDATION_TRESHOLD_BPS: number = 8000;
  const LTV_BPS: number = 10000;
  const LIQUIDATION_BONUS_BPS: number = 1000;
  it("Initialize config", async () => {
    [configPda] = await PublicKey.findProgramAddressSync(
      [Buffer.from("config"), admin.publicKey.toBuffer()],
      program.programId,
    );

    await program.methods.initConfig().accounts({
      initializer: admin.publicKey,
      config: configPda,
      systemProgram: SystemProgram.programId,
    }).signers([]).rpc();

    const config = await program.account.config.fetch(configPda);
    console.log(`Config:`, config);
  });
  it("Create pool", async () => {
    [poolPda] = await PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), configPda.toBuffer()],
      program.programId,
    );
    mintX = await createMint(provider.connection, admin.payer, admin.publicKey, null, 6);
    dTokenMint = anchor.web3.Keypair.generate();
    vaultAta = getAssociatedTokenAddressSync(
      mintX,
      configPda,
      true,
    );
    const PRICEFEEDACCOUNT = new PublicKey("7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE");
    const PRICE_FEED_HEX = "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
    const PRICEFEEDID = Buffer.from(PRICE_FEED_HEX, "hex");
    await program.methods.createPool(PRICEFEEDACCOUNT, PRICEFEEDID, LIQUIDATION_TRESHOLD_BPS, LTV_BPS, LIQUIDATION_BONUS_BPS).accounts({
      admin: admin.publicKey,
      mint: mintX,
      config: configPda,
      dtokenMint: dTokenMint.publicKey,
      pool: poolPda,
      vault: vaultAta,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
    }).signers([admin.payer, dTokenMint]).rpc();
    const pool = await program.account.pool.fetch(poolPda);
    console.log(`Pool:`, pool);
  });
  it("deposit", async () => {

  });
});
