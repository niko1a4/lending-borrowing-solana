import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity("pools")
export class PoolEntity {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    pool: string;

    @Column()
    mint: string;

    @Column({ type: "bigint" })
    timestamp: number;
}