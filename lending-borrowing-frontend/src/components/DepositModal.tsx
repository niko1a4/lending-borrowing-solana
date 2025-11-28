import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useProgram } from "../hooks/useProgram";
import { getPDAs, getUserPoolPositionPDA, getUserPositionPDA } from "../utils/anchor-client";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { BN, Wallet } from "@coral-xyz/anchor";



interface DepositModalProps {
    poolAddress: string;
    mintAddress: string;
    onClose: () => void;
    onSuccess: () => void;
}

export const DepositModal = ({ poolAddress, mintAddress, onClose, onSuccess }: DepositModalProps) => {
    const { publicKey } = useWallet();
    const { program } = useProgram();
    const [amount, setAmount] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleDeposit = async () => {
        if (!publicKey || !amount) return;

        try {
            setLoading(true);
            setError("");

            const mint = new PublicKey(mintAddress);
            const pool = new PublicKey(poolAddress);

            const poolAccount = await (program.account as any).pool.fetch(pool);
            const dtokenMint = new PublicKey(poolAccount.mintDtoken);
            const vault = new PublicKey(poolAccount.vault);
            const config = new PublicKey(poolAccount.config);
            const oracle = new PublicKey(poolAccount.oracle);
            const userTokenAta = await getAssociatedTokenAddress(mint, publicKey);
            const userDtokenAta = await getAssociatedTokenAddress(dtokenMint, publicKey);
            const userPoolPosition = getUserPoolPositionPDA(publicKey, pool);
            const userPosition = getUserPositionPDA(publicKey);
            const depositAmount = new BN(Math.floor(parseFloat(amount) * Math.pow(10, 9)));

            // 1 deposit_tokens
            console.log("Step 1: Calling deposit_tokens...");
            const tx1 = await program.methods
                .depositTokens(depositAmount)
                .accountsPartial({
                    user: publicKey,
                    underlyingMint: mint,
                    dtokenMint: dtokenMint,
                    config: config,
                    pool: pool,
                    vault: vault,
                    userAta: userTokenAta,
                    userDtokenAta: userDtokenAta,
                    userPoolPosition: userPoolPosition,
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                })
                .rpc();

            console.log("deposit_tokens tx:", tx1);

            // 2 update_deposit_position
            console.log("Step 2: Calling update_deposit_position...");
            const tx2 = await program.methods
                .updateDepositPosition(depositAmount)
                .accountsPartial({
                    user: publicKey,
                    underlyingMint: mint,
                    config: config,
                    pool: pool,
                    userPosition: userPosition,
                    userPoolPosition: userPoolPosition,
                    oracle: oracle,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            console.log("update_deposit_position tx:", tx2);

            alert("Deposit successful!");
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Deposit error:", err);
            setError(err.message || "Deposit failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>Deposit Tokens</h2>

                <div className="input-group">
                    <label>Amount</label>
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        disabled={loading}
                    />
                </div>

                {error && <div className="error-message">{error}</div>}

                <div className="modal-actions">
                    <button onClick={onClose} disabled={loading}>
                        Cancel
                    </button>
                    <button onClick={handleDeposit} disabled={loading || !amount}>
                        {loading ? "Processing..." : "Deposit"}
                    </button>
                </div>
            </div>
        </div>
    );
};