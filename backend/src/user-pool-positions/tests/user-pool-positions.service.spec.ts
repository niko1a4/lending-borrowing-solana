import { Test, TestingModule } from '@nestjs/testing';
import { UserPoolPositionsService } from '../user-pool-positions.service';

describe('UserPoolPositionsService', () => {
  let service: UserPoolPositionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserPoolPositionsService],
    }).compile();

    service = module.get<UserPoolPositionsService>(UserPoolPositionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
