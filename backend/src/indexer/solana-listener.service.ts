import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { AnchorProvider, Program, Idl, setProvider } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import idl from "../../../lending-borrowing/target/idl/lending_borrowing.json";
import { EventProcessorService } from "./event-processor.service";

@Injectable()
export class SolanaListenerService implements OnModuleInit {
    private readonly logger = new Logger(SolanaListenerService.name);
    private program!: Program;

    constructor(private readonly eventProcessor: EventProcessorService) { }

    async onModuleInit() {
        const rpcUrl = process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com';
        const connection = new Connection(rpcUrl, 'confirmed');
        const provider = new AnchorProvider(connection, {} as any, { commitment: 'confirmed' });

        const programId = new PublicKey(process.env.PROGRAM_ID!);
        this.program = new Program(idl as Idl, provider);

        this.logger.log(`Listening for LendingBorrowing events on ${programId.toBase58()}...`);

        this.setupListeners();
    }

    private setupListeners() {

        this.program.addEventListener("createPoolEvent", async (event, slot, signature) => {
            await this.eventProcessor.process({ name: "CreatePoolEvent", data: event }, signature);
        });


        this.program.addEventListener("depositEvent", async (event, slot, signature) => {
            await this.eventProcessor.process({ name: "DepositEvent", data: event }, signature);
        });


        this.program.addEventListener("withdrawEvent", async (event, slot, signature) => {
            await this.eventProcessor.process({ name: "WithdrawEvent", data: event }, signature);
        });


        this.program.addEventListener("borrowEvent", async (event, slot, signature) => {
            await this.eventProcessor.process({ name: "BorrowEvent", data: event }, signature);
        });


        this.program.addEventListener("repayEvent", async (event, slot, signature) => {
            await this.eventProcessor.process({ name: "RepayEvent", data: event }, signature);
        });


        this.program.addEventListener("liquidateEvent", async (event, slot, signature) => {
            await this.eventProcessor.process({ name: "LiquidateEvent", data: event }, signature);
        });


        this.program.addEventListener("initConfigEvent", async (event, slot, signature) => {
            this.logger.log("InitConfigEvent received (ignored).");
        });

        this.logger.log("Event listeners initialized.");
    }
}
