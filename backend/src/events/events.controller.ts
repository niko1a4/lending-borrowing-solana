import { Controller, Get, Query } from "@nestjs/common";
import { EventsService } from "./events.service";

@Controller("events")
export class EventsController {
    constructor(private readonly eventsService: EventsService) { }

    @Get()
    async getEvents(
        @Query("user") user?: string,
        @Query("pool") pool?: string,
        @Query("eventType") eventType?: string,
        @Query("signature") signature?: string,
    ) {
        return await this.eventsService.getEvents({
            user,
            pool,
            eventType,
            signature,
        });
    }
}