import { useState } from "react";
import { Pool } from "../hooks/usePools";
import { DepositModal } from "./DepositModal";
import { WithdrawModal } from "./WithdrawModal";
import { BorrowModal } from "./BorrowModal";
import { RepayModal } from "./RepayModal";

interface PoolCardProps {
    pool: Pool;
    onActionComplete: () => void;
}

export const PoolCard = ({ pool, onActionComplete }: PoolCardProps) => {
    const [showDepositModal, setShowDepositModal] = useState(false);
    const [showWithdrawModal, setShowWithdrawModal] = useState(false);
    const [showBorrowModal, setShowBorrowModal] = useState(false);
    const [showRepayModal, setShowRepayModal] = useState(false);

    return (
        <>
            <div className="pool-card">
                <h3>Pool</h3>
                <div className="pool-info">
                    <div className="info-row">
                        <span>Pool Address:</span>
                        <span className="address">{pool.pool.slice(0, 8)}...{pool.pool.slice(-8)}</span>
                    </div>
                    <div className="info-row">
                        <span>Mint:</span>
                        <span className="address">{pool.mint.slice(0, 8)}...{pool.mint.slice(-8)}</span>
                    </div>
                    <div className="info-row">
                        <span>Created:</span>
                        <span>{new Date(pool.timestamp * 1000).toLocaleDateString()}</span>
                    </div>
                </div>

                <div className="pool-actions">
                    <button onClick={() => setShowDepositModal(true)}>Deposit</button>
                    <button onClick={() => setShowWithdrawModal(true)}>Withdraw</button>
                    <button onClick={() => setShowBorrowModal(true)}>Borrow</button>
                    <button onClick={() => setShowRepayModal(true)}>Repay</button>
                </div>
            </div>

            {showDepositModal && (
                <DepositModal
                    poolAddress={pool.pool}
                    mintAddress={pool.mint}
                    onClose={() => setShowDepositModal(false)}
                    onSuccess={onActionComplete}
                />
            )}

            {showWithdrawModal && (
                <WithdrawModal
                    poolAddress={pool.pool}
                    mintAddress={pool.mint}
                    onClose={() => setShowWithdrawModal(false)}
                    onSuccess={onActionComplete}
                />
            )}

            {showBorrowModal && (
                <BorrowModal
                    poolAddress={pool.pool}
                    mintAddress={pool.mint}
                    onClose={() => setShowBorrowModal(false)}
                    onSuccess={onActionComplete}
                />
            )}

            {showRepayModal && (
                <RepayModal
                    poolAddress={pool.pool}
                    mintAddress={pool.mint}
                    onClose={() => setShowRepayModal(false)}
                    onSuccess={onActionComplete}
                />
            )}
        </>
    );
};