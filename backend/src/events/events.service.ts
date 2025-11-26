import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { EventEntity } from './entities/event.entity';

@Injectable()
export class EventsService {
    constructor(@InjectRepository(EventEntity) private readonly eventsRepo: Repository<EventEntity>) { }

    async saveEvent(data: Partial<EventEntity>) {
        return await this.eventsRepo.save(data);
    }

    async getEvents(filters: {
        user?: string;
        pool?: string;
        eventType?: string;
        signature?: string;
    }) {
        const where: FindOptionsWhere<EventEntity> = {};

        if (filters.user) where.user = filters.user;
        if (filters.pool) where.pool = filters.pool;
        if (filters.eventType) where.eventType = filters.eventType;
        if (filters.signature) where.signature = filters.signature;

        return await this.eventsRepo.find({
            where,
            order: { timestamp: "DESC" },
        });
    }
}
