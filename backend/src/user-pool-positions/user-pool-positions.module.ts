import { Module } from '@nestjs/common';
import { UserPoolPositionsController } from './user-pool-positions.controller';
import { UserPoolPositionsService } from './user-pool-positions.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserPoolPositionEntity } from './entities/user-pool-position.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserPoolPositionEntity])],
  controllers: [UserPoolPositionsController],
  providers: [UserPoolPositionsService],
  exports: [UserPoolPositionsService],
})
export class UserPoolPositionsModule { }
