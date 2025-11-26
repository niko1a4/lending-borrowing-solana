import { Injectable, Logger } from "@nestjs/common";
import { EventsService } from "../events/events.service";
import { UserPoolPositionsService } from "../user-pool-positions/user-pool-positions.service";
import { PoolsService } from "../pools/pools.service";

@Injectable()
export class EventProcessorService {
    private readonly logger = new Logger(EventProcessorService.name);

    constructor(
        private readonly eventsService: EventsService,
        private readonly uppService: UserPoolPositionsService,
        private readonly poolsService: PoolsService,
    ) { }

    async process(event: any, signature: string) {
        try {
            const eventName = event.name;
            const data = event.data;


            await this.eventsService.saveEvent({
                eventType: eventName,
                user: data.user ? data.user.toBase58() : null,
                pool: data.pool ? data.pool.toBase58() : null,
                mint: data.mint ? data.mint.toBase58() : null,
                data: data,
                signature,
                timestamp: data.timestamp ?? Date.now(),
            });


            switch (eventName) {
                case "CreatePoolEvent":
                    await this.poolsService.savePool({
                        pool: data.pool.toBase58(),
                        mint: data.mint.toBase58(),
                        timestamp: data.timestamp,
                    });
                    break;

                case "DepositEvent":
                    await this.uppService.updateDeposit(data);
                    break;

                case "WithdrawEvent":
                    await this.uppService.updateWithdraw(data);
                    break;

                case "BorrowEvent":
                    await this.uppService.updateBorrow(data);
                    break;

                case "RepayEvent":
                    await this.uppService.updateRepay(data);
                    break;

                case "LiquidateEvent":
                    await this.uppService.updateLiquidate(data);
                    break;

                default:
                    this.logger.debug(`Unhandled event type: ${eventName}`);
            }

            this.logger.log(`Processed ${eventName} (${signature})`);
        } catch (err) {
            this.logger.error("Error processing event", err);
        }
    }
}
