import { Controller, Get, Param } from '@nestjs/common';
import { PoolsService } from './pools.service';

@Controller('pools')
export class PoolsController {
    constructor(private readonly poolsService: PoolsService) { }

    @Get()
    async getAllPools() {
        return await this.poolsService.getAll();
    }

    @Get(":pool")
    async getPool(@Param("pool") pool: string) {
        return await this.poolsService.getByPoolAddress(pool);
    }
}
