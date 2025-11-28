import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useProgram } from "../hooks/useProgram";
import { getPDAs, getUserPoolPositionPDA, getUserPositionPDA } from "../utils/anchor-client";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
interface RepayModalProps {
    poolAddress: string;
    mintAddress: string;
    onClose: () => void;
    onSuccess: () => void;
}

export const RepayModal = ({ poolAddress, mintAddress, onClose, onSuccess }: RepayModalProps) => {
    const { publicKey } = useWallet();
    const { program } = useProgram();
    const [amount, setAmount] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleRepay = async () => {
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
            const userMintAta = await getAssociatedTokenAddress(mint, publicKey);
            const userPoolPosition = getUserPoolPositionPDA(publicKey, pool);
            const userPosition = getUserPositionPDA(publicKey);

            const repayAmount = new BN(Math.floor(parseFloat(amount) * Math.pow(10, 9)));

            const tx = await program.methods
                .repay(repayAmount)
                .accounts({
                    user: publicKey,
                    underlyingMint: mint,
                    pool: pool,
                    config: config,
                    userMintAta: userMintAta,
                    vault: vault,
                    userPosition: userPosition,
                    userPoolPosition: userPoolPosition,
                    oracle: oracle,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .rpc();

            console.log("Repay tx:", tx);
            alert("Repayment successful!");
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Repay error:", err);
            setError(err.message || "Repayment failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>Repay Loan</h2>

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
                    <button onClick={handleRepay} disabled={loading || !amount}>
                        {loading ? "Processing..." : "Repay"}
                    </button>
                </div>
            </div>
        </div>
    );
};