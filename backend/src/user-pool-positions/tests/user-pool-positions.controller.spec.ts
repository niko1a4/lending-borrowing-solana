import { Test, TestingModule } from '@nestjs/testing';
import { UserPoolPositionsController } from '../user-pool-positions.controller';

describe('UserPoolPositionsController', () => {
  let controller: UserPoolPositionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserPoolPositionsController],
    }).compile();

    controller = module.get<UserPoolPositionsController>(UserPoolPositionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
