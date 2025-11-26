import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { useMemo } from "react";
import { getProgram } from "../utils/anchor-client";

export const useProgram = () => {
    const wallet = useAnchorWallet();

    const program = useMemo(() => {
        return getProgram(wallet);
    }, [wallet]);

    return { program, wallet };
};