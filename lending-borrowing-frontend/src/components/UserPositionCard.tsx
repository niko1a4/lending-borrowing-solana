import { UserPosition } from "../hooks/useUserPositions";

interface UserPositionCardProps {
    position: UserPosition;
}

export const UserPositionCard = ({ position }: UserPositionCardProps) => {
    const formatAmount = (amount: number) => {
        return (amount / Math.pow(10, 9)).toFixed(4);
    };

    return (
        <div className="position-card">
            <h3>Position</h3>
            <div className="position-info">
                <div className="info-row">
                    <span>Pool:</span>
                    <span className="address">{position.pool.slice(0, 8)}...{position.pool.slice(-8)}</span>
                </div>
                <div className="info-row">
                    <span>Mint:</span>
                    <span className="address">{position.mint.slice(0, 8)}...{position.mint.slice(-8)}</span>
                </div>
                <div className="info-row">
                    <span>Deposited:</span>
                    <span className="amount">{formatAmount(position.depositedAmount)}</span>
                </div>
                <div className="info-row">
                    <span>Borrowed:</span>
                    <span className="amount">{formatAmount(position.borrowedAmount)}</span>
                </div>
                <div className="info-row">
                    <span>Last Updated:</span>
                    <span>{new Date(position.lastUpdated * 1000).toLocaleString()}</span>
                </div>
            </div>
        </div>
    );
};