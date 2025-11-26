import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useProgram } from "../hooks/useProgram";
import { getPDAs, getUserPositionPDA } from "../utils/anchor-client";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";

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
            const { vault, dtokenMint } = getPDAs(mint);

            const userTokenAccount = await getAssociatedTokenAddress(mint, publicKey);
            const userDtokenAccount = await getAssociatedTokenAddress(dtokenMint, publicKey);
            const userPosition = getUserPositionPDA(publicKey, pool);

            const depositAmount = Math.floor(parseFloat(amount) * Math.pow(10, 9)); // Assuming 9 decimals

            // Step 1: deposit_tokens
            console.log("Step 1: Calling deposit_tokens...");
            const tx1 = await program.methods
                .depositTokens(depositAmount)
                .accounts({
                    user: publicKey,
                    pool: pool,
                    mint: mint,
                    vault: vault,
                    userTokenAccount: userTokenAccount,
                    dtokenMint: dtokenMint,
                    userDtokenAccount: userDtokenAccount,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .rpc();

            console.log("deposit_tokens tx:", tx1);

            // Step 2: update_deposit_position
            console.log("Step 2: Calling update_deposit_position...");
            const tx2 = await program.methods
                .updateDepositPosition(depositAmount)
                .accounts({
                    user: publicKey,
                    pool: pool,
                    userPosition: userPosition,
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