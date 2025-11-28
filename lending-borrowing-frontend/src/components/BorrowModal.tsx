import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useProgram } from "../hooks/useProgram";
import { getPDAs, getUserPositionPDA, getConfigPDA, getUserPoolPositionPDA } from "../utils/anchor-client";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
interface BorrowModalProps {
    poolAddress: string;
    mintAddress: string;
    onClose: () => void;
    onSuccess: () => void;
}

export const BorrowModal = ({ poolAddress, mintAddress, onClose, onSuccess }: BorrowModalProps) => {
    const { publicKey } = useWallet();
    const { program } = useProgram();
    const [amount, setAmount] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleBorrow = async () => {
        if (!publicKey || !amount) return;

        try {
            setLoading(true);
            setError("");

            const mint = new PublicKey(mintAddress);
            const pool = new PublicKey(poolAddress);
            const poolAccount = await (program.account as any).pool.fetch(pool);
            const vault = new PublicKey(poolAccount.vault);
            const config = new PublicKey(poolAccount.config);
            const oracle = new PublicKey(poolAccount.oracle);
            const userAta = await getAssociatedTokenAddress(mint, publicKey);
            const userPoolPosition = getUserPoolPositionPDA(publicKey, pool);
            const userPosition = getUserPositionPDA(publicKey);
            const borrowAmount = new BN(Math.floor(parseFloat(amount) * Math.pow(10, 9)));

            const tx = await program.methods
                .borrow(borrowAmount)
                .accounts({
                    user: publicKey,
                    underlyingMint: mint,
                    pool: pool,
                    config: config,
                    userAta: userAta,
                    userPoolPosition: userPoolPosition,
                    userPosition: userPosition,
                    vault: vault,
                    oracle: oracle,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            console.log("Borrow tx:", tx);
            alert("Borrow successful!");
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Borrow error:", err);
            setError(err.message || "Borrow failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>Borrow Tokens</h2>

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
                    <button onClick={handleBorrow} disabled={loading || !amount}>
                        {loading ? "Processing..." : "Borrow"}
                    </button>
                </div>
            </div>
        </div>
    );
};