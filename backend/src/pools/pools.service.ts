import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PoolEntity } from './entities/pool.entity';

@Injectable()
export class PoolsService {
    constructor(@InjectRepository(PoolEntity) private readonly poolRepo: Repository<PoolEntity>) { }

    async savePool(pool: Partial<PoolEntity>) {
        return await this.poolRepo.save(pool);
    }

    async getAll() {
        return await this.poolRepo.find();
    }

    async getByPoolAddress(pool: string) {
        return await this.poolRepo.findOne({ where: { pool } });
    }
}
