import { useWallet } from "@solana/wallet-adapter-react";
import { useUserPositions } from "../hooks/useUserPositions";
import { UserPositionCard } from "../components/UserPositionCard";

export const MyPositions = () => {
    const { publicKey } = useWallet();
    const { positions, loading, error } = useUserPositions();

    if (!publicKey) {
        return (
            <div className="my-positions">
                <h1>My Positions</h1>
                <div className="empty-state">
                    <p>Please connect your wallet to view your positions.</p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="my-positions">
                <h1>My Positions</h1>
                <div className="loading">Loading positions...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="my-positions">
                <h1>My Positions</h1>
                <div className="error">Error: {error}</div>
            </div>
        );
    }

    return (
        <div className="my-positions">
            <h1>My Positions</h1>
            <p className="subtitle">Your lending and borrowing positions</p>

            {positions.length === 0 ? (
                <div className="empty-state">
                    <p>You don't have any positions yet.</p>
                    <p>Visit the dashboard to start lending or borrowing.</p>
                </div>
            ) : (
                <div className="positions-grid">
                    {positions.map((position) => (
                        <UserPositionCard key={position.id} position={position} />
                    ))}
                </div>
            )}
        </div>
    );
};