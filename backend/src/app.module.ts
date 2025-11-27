import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PoolsModule } from './pools/pools.module';
import { UserPoolPositionsModule } from './user-pool-positions/user-pool-positions.module';
import { EventsModule } from './events/events.module';
import { IndexerModule } from './indexer/indexer.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: Number(process.env.DB_PORT) ?? 5432,
      username: process.env.DB_USERNAME ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'lending-borrowing',
      database: process.env.DB_DATABASE ?? 'lending-borrowing',
      autoLoadEntities: true,
      synchronize: true
    }),
    PoolsModule,
    UserPoolPositionsModule,
    EventsModule,
    IndexerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
