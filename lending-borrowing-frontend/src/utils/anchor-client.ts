import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import idl from "../idl/lending_borrowing.json";
import { PROGRAM_ID, NETWORK } from "./constants";
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
    const [pool] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), mint.toBuffer()],
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
    const [config] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        PROGRAM_ID
    );
    return config;
};

export const getUserPositionPDA = (user: PublicKey, pool: PublicKey) => {
    const [userPosition] = PublicKey.findProgramAddressSync(
        [Buffer.from("user_position"), user.toBuffer(), pool.toBuffer()],
        PROGRAM_ID
    );
    return userPosition;
};