import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useProgram } from "../hooks/useProgram";
import { getPDAs, getUserPoolPositionPDA, getUserPositionPDA } from "../utils/anchor-client";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
interface WithdrawModalProps {
    poolAddress: string;
    mintAddress: string;
    onClose: () => void;
    onSuccess: () => void;
}

export const WithdrawModal = ({ poolAddress, mintAddress, onClose, onSuccess }: WithdrawModalProps) => {
    const { publicKey } = useWallet();
    const { program } = useProgram();
    const [dtokenAmount, setDtokenAmount] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleWithdraw = async () => {
        if (!publicKey || !dtokenAmount) return;

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
            const dtokenAmountBN = new BN(Math.floor(parseFloat(dtokenAmount) * Math.pow(10, 9)));
            const tx = await program.methods
                .withdraw(dtokenAmountBN)
                .accounts({
                    user: publicKey,
                    mint: mint,
                    mintDtoken: dtokenMint,
                    pool: pool,
                    config: config,
                    vault: vault,
                    userDtokenAta: userDtokenAta,
                    userTokenAta: userTokenAta,
                    userPoolPosition: userPoolPosition,
                    userPosition: userPosition,
                    oracle: oracle,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            console.log("Withdraw tx:", tx);
            alert("Withdrawal successful!");
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Withdraw error:", err);
            setError(err.message || "Withdrawal failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>Withdraw Tokens</h2>

                <div className="input-group">
                    <label>DToken Amount</label>
                    <input
                        type="number"
                        value={dtokenAmount}
                        onChange={(e) => setDtokenAmount(e.target.value)}
                        placeholder="0.00"
                        disabled={loading}
                    />
                </div>

                {error && <div className="error-message">{error}</div>}

                <div className="modal-actions">
                    <button onClick={onClose} disabled={loading}>
                        Cancel
                    </button>
                    <button onClick={handleWithdraw} disabled={loading || !dtokenAmount}>
                        {loading ? "Processing..." : "Withdraw"}
                    </button>
                </div>
            </div>
        </div>
    );
};