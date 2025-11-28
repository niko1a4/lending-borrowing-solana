import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import idl from "../idl/lending_borrowing.json";
import { PROGRAM_ID, NETWORK, ADMIN_PUBKEY } from "./constants";
import { Buffer } from "buffer";

export const getProgram = (wallet: AnchorWallet | undefined) => {
    const connection = new Connection(NETWORK, "confirmed");

    if (!wallet) {
        // Return a read-only provider for fetching data
        const provider = new AnchorProvider(connection, {} as any, {
            commitment: "confirmed",
        });
        return new Program(idl as Idl, provider);
    }

    const provider = new AnchorProvider(connection, wallet, {
        commitment: "confirmed",
    });

    return new Program(idl as Idl, provider);
};

// Helper to derive PDA addresses
export const getPDAs = (mint: PublicKey) => {
    const config = getConfigPDA();
    const [pool] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), config.toBuffer(), mint.toBuffer()],
        PROGRAM_ID
    );

    const [vault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), pool.toBuffer()],
        PROGRAM_ID
    );

    const [dtokenMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("dtoken_mint"), pool.toBuffer()],
        PROGRAM_ID
    );

    return { pool, vault, dtokenMint };
};

export const getConfigPDA = () => {
    const adminPubkey = new PublicKey(ADMIN_PUBKEY);
    const [config] = PublicKey.findProgramAddressSync(
        [Buffer.from("config"), adminPubkey.toBuffer()],
        PROGRAM_ID
    );
    return config;
};

export const getUserPositionPDA = (user: PublicKey) => {
    const [userPosition] = PublicKey.findProgramAddressSync(
        [Buffer.from("user-position"), user.toBuffer()],
        PROGRAM_ID
    );
    return userPosition;
};
export const getUserPoolPositionPDA = (user: PublicKey, pool: PublicKey) => {
    const [userPoolPosition] = PublicKey.findProgramAddressSync(
        [Buffer.from("user-pool-position"), user.toBuffer(), pool.toBuffer()],
        PROGRAM_ID,
    );
    return userPoolPosition;
}