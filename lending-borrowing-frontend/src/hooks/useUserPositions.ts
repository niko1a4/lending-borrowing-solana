import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { API_BASE_URL } from "../utils/constants";

export interface UserPosition {
    id: string;
    user: string;
    pool: string;
    mint: string;
    depositedAmount: number;
    borrowedAmount: number;
    lastUpdated: number;
}

export const useUserPositions = () => {
    const { publicKey } = useWallet();
    const [positions, setPositions] = useState<UserPosition[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (publicKey) {
            fetchPositions();
        } else {
            setPositions([]);
        }
    }, [publicKey]);

    const fetchPositions = async () => {
        if (!publicKey) return;

        try {
            setLoading(true);
            const response = await fetch(
                `${API_BASE_URL}/user-pool-positions?user=${publicKey.toBase58()}`
            );
            if (!response.ok) throw new Error("Failed to fetch positions");
            const data = await response.json();
            setPositions(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    };

    return { positions, loading, error, refetch: fetchPositions };
};