import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity("events")
export class EventEntity {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    eventType: string; //deposit, withdraw, borrow, repay, liquidate, createPool, initConfig

    @Column({ nullable: true })
    user: string;

    @Column({ nullable: true })
    pool: string;

    @Column({ nullable: true })
    mint: string;

    @Column({ type: "jsonb" })
    data: any;

    @Column()
    signature: string;

    @Column({ type: "bigint" })
    timestamp: number;
}