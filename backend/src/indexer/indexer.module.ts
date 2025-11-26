import { Module } from '@nestjs/common';
import { SolanaListenerService } from "./solana-listener.service";
import { EventProcessorService } from "./event-processor.service";
import { EventsModule } from "../events/events.module";
import { PoolsModule } from "../pools/pools.module";
import { UserPoolPositionsModule } from "../user-pool-positions/user-pool-positions.module";
@Module({
    imports: [EventsModule, PoolsModule, UserPoolPositionsModule],
    providers: [SolanaListenerService, EventProcessorService],
})
export class IndexerModule { }
