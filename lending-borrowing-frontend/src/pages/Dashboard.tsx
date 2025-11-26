import { usePools } from "../hooks/usePools";
import { useUserPositions } from "../hooks/useUserPositions";
import { PoolCard } from "../components/PoolCard";

export const Dashboard = () => {
    const { pools, loading, error } = usePools();
    const { refetch: refetchPositions } = useUserPositions();

    const handleActionComplete = () => {
        // Refetch positions after any action
        refetchPositions();
    };

    if (loading) {
        return <div className="loading">Loading pools...</div>;
    }

    if (error) {
        return <div className="error">Error: {error}</div>;
    }

    return (
        <div className="dashboard">
            <h1>Lending Pools</h1>
            <p className="subtitle">Available pools for lending and borrowing</p>

            {pools.length === 0 ? (
                <div className="empty-state">
                    <p>No pools available yet.</p>
                </div>
            ) : (
                <div className="pools-grid">
                    {pools.map((pool) => (
                        <PoolCard key={pool.id} pool={pool} onActionComplete={handleActionComplete} />
                    ))}
                </div>
            )}
        </div>
    );
};