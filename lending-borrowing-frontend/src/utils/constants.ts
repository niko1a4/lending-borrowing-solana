import { PublicKey } from "@solana/web3.js";

// Your program ID from lib.rs
export const PROGRAM_ID = new PublicKey("4A2DJsPrMxb1EChuCqyUAvWYUt9xHHFHSHsjW9pdvSHV");

// Network endpoint (change based on your deployment)
export const NETWORK = "http://127.0.0.1:8899"; // localnet
// export const NETWORK = "https://api.devnet.solana.com"; // devnet

// Backend API endpoint
export const API_BASE_URL = "http://localhost:3000";