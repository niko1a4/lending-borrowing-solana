import { Controller, Get, Param, Query } from '@nestjs/common';
import { UserPoolPositionsService } from './user-pool-positions.service';

@Controller('user-pool-positions')
export class UserPoolPositionsController {
    constructor(private readonly uppService: UserPoolPositionsService) { }

    // GET /user-pool-positions
    @Get()
    async getAll(@Query("user") user?: string, @Query("pool") pool?: string) {
        if (user && pool) return await this.uppService.getByUserAndPool(user, pool);
        if (user) return await this.uppService.getByUser(user);
        if (pool) return await this.uppService.getByPool(pool);
        return await this.uppService.getAll();
    }

    // GET /user-pool-positions/:user/:pool   
    @Get(":user/:pool")
    async getUserPool(
        @Param("user") user: string,
        @Param("pool") pool: string,
    ) {
        return await this.uppService.getByUserAndPool(user, pool);
    }
}
