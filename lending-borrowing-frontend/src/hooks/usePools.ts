import { useState, useEffect } from "react";
import { API_BASE_URL } from "../utils/constants";

export interface Pool {
    id: string;
    pool: string;
    mint: string;
    timestamp: number;
}

export const usePools = () => {
    const [pools, setPools] = useState<Pool[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchPools();
    }, []);

    const fetchPools = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${API_BASE_URL}/pools`);
            if (!response.ok) throw new Error("Failed to fetch pools");
            const data = await response.json();
            setPools(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    };

    return { pools, loading, error, refetch: fetchPools };
};