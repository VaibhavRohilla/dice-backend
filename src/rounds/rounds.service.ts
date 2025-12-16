import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Round, RoundDocument } from './rounds.schema';

@Injectable()
export class RoundsService {
  constructor(@InjectModel(Round.name) private readonly roundModel: Model<RoundDocument>) {}

  async insertStartedRound(input: {
    chatId: number;
    createdBy: number;
    startAt: Date;
    endAt: Date;
  }): Promise<RoundDocument> {
    return this.roundModel.create({
      ...input,
      diceValues: null,
      createdAt: new Date(),
    });
  }

  async setDiceValues(roundId: string, diceValues: number[]): Promise<void> {
    await this.roundModel.updateOne({ _id: roundId }, { $set: { diceValues } }).exec();
  }

  async getLatestRound(chatId: number): Promise<RoundDocument | null> {
    return this.roundModel.findOne({ chatId }).sort({ startAt: -1 }).exec();
  }
}
