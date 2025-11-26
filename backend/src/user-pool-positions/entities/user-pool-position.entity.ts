import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity("user_pool_positions")
export class UserPoolPositionEntity {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    user: string;

    @Column()
    pool: string;

    @Column()
    mint: string;

    @Column({ type: "bigint", default: 0 })
    depositedAmount: number;

    @Column({ type: "bigint", default: 0 })
    borrowedAmount: number;

    @Column({ type: "bigint", default: 0 })
    lastUpdated: number;
}