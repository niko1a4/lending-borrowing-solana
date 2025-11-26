import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { UserPoolPositionEntity } from './entities/user-pool-position.entity';

@Injectable()
export class UserPoolPositionsService {
    constructor(@InjectRepository(UserPoolPositionEntity) private readonly uppRepo: Repository<UserPoolPositionEntity>) { }

    async savePosition(data: Partial<UserPoolPositionEntity>) {
        return await this.uppRepo.save(data);
    }
    async getAll() {
        return await this.uppRepo.find();
    }

    async getByUser(user: string) {
        return await this.uppRepo.find({
            where: { user },
            order: { lastUpdated: "DESC" },
        });
    }

    async getByPool(pool: string) {
        return await this.uppRepo.find({
            where: { pool },
            order: { lastUpdated: "DESC" },
        });
    }

    async getByUserAndPool(user: string, pool: string) {
        return await this.uppRepo.findOne({
            where: { user, pool },
        });
    }

    async updateDeposit(event: any) {
        const user = event.user.toBase58();
        const pool = event.pool.toBase58();
        const mint = event.mint.toBase58();
        const amount = Number(event.deposit_amount);

        let pos = await this.uppRepo.findOne({ where: { user, pool } });

        if (!pos) {
            pos = this.uppRepo.create({
                user,
                pool,
                mint,
                depositedAmount: amount,
                borrowedAmount: 0,
                lastUpdated: event.timestamp,
            });
        } else {
            pos.depositedAmount += amount;
            pos.lastUpdated = event.timestamp;
        }

        return await this.uppRepo.save(pos);
    }


    async updateWithdraw(event: any) {
        const user = event.user.toBase58();
        const pool = event.pool.toBase58();
        const mint = event.mint.toBase58();
        const amount = Number(event.amount);

        let pos = await this.uppRepo.findOne({ where: { user, pool } });

        if (!pos) return;

        pos.depositedAmount -= amount;
        if (pos.depositedAmount < 0) pos.depositedAmount = 0;

        pos.lastUpdated = event.timestamp;

        return await this.uppRepo.save(pos);
    }


    async updateBorrow(event: any) {
        const user = event.user.toBase58();
        const pool = event.pool.toBase58();
        const mint = event.mint.toBase58();
        const amount = Number(event.amount);

        let pos = await this.uppRepo.findOne({ where: { user, pool } });

        if (!pos) {
            pos = this.uppRepo.create({
                user,
                pool,
                mint,
                depositedAmount: 0,
                borrowedAmount: amount,
                lastUpdated: event.timestamp,
            });
        } else {
            pos.borrowedAmount += amount;
            pos.lastUpdated = event.timestamp;
        }

        return await this.uppRepo.save(pos);
    }


    async updateRepay(event: any) {
        const user = event.user.toBase58();
        const pool = event.pool.toBase58();
        const mint = event.mint.toBase58();
        const amount = Number(event.amount);

        let pos = await this.uppRepo.findOne({ where: { user, pool } });

        if (!pos) return;

        pos.borrowedAmount -= amount;
        if (pos.borrowedAmount < 0) pos.borrowedAmount = 0;

        pos.lastUpdated = event.timestamp;

        return await this.uppRepo.save(pos);
    }


    async updateLiquidate(event: any) {
        const borrower = event.borrower.toBase58();
        const debtPool = event.debt_pool.toBase58();
        const collateralPool = event.collateral_pool.toBase58();
        const debtRepaid = Number(event.debt_repaid);
        const collateralSeized = Number(event.collater_seized);

        let debtPos = await this.uppRepo.findOne({ where: { user: borrower, pool: debtPool } });
        if (debtPos) {
            debtPos.borrowedAmount -= debtRepaid;
            if (debtPos.borrowedAmount < 0) debtPos.borrowedAmount = 0;
            debtPos.lastUpdated = Date.now();
            await this.uppRepo.save(debtPos);
        }

        let collateralPos = await this.uppRepo.findOne({ where: { user: borrower, pool: collateralPool } });
        if (collateralPos) {
            collateralPos.depositedAmount -= collateralSeized;
            if (collateralPos.depositedAmount < 0) collateralPos.depositedAmount = 0;
            collateralPos.lastUpdated = Date.now();
            await this.uppRepo.save(collateralPos);
        }
    }
}
