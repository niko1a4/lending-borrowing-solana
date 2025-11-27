import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
    import.meta.env.VITE_PROGRAM_ID || "4A2DJsPrMxb1EChuCqyUAvWYUt9xHHFHSHsjW9pdvSHV"
);

export const NETWORK =
    import.meta.env.VITE_SOLANA_RPC_URL || "https://api.devnet.solana.com";

export const API_BASE_URL =
    import.meta.env.VITE_API_URL || "http://localhost:3000";

export const ADMIN_PUBKEY = "DwUkSRrMWtcxsqVEJk7coMwpRVXDdxS2mxBPjMMgN1pY";