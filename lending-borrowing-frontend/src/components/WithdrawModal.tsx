import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useProgram } from "../hooks/useProgram";
import { getPDAs, getUserPositionPDA } from "../utils/anchor-client";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";

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
            const { vault, dtokenMint } = getPDAs(mint);

            const userTokenAccount = await getAssociatedTokenAddress(mint, publicKey);
            const userDtokenAccount = await getAssociatedTokenAddress(dtokenMint, publicKey);
            const userPosition = getUserPositionPDA(publicKey, pool);

            const amount = Math.floor(parseFloat(dtokenAmount) * Math.pow(10, 9));

            const tx = await program.methods
                .withdraw(amount)
                .accounts({
                    user: publicKey,
                    pool: pool,
                    mint: mint,
                    vault: vault,
                    userTokenAccount: userTokenAccount,
                    dtokenMint: dtokenMint,
                    userDtokenAccount: userDtokenAccount,
                    userPosition: userPosition,
                    tokenProgram: TOKEN_PROGRAM_ID,
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