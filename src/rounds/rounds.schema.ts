import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RoundDocument = HydratedDocument<Round>;

@Schema({ collection: 'rounds' })
export class Round {
  @Prop({ required: true, index: true })
  chatId!: number;

  @Prop({ required: true })
  createdBy!: number;

  @Prop({ required: true })
  startAt!: Date;

  @Prop({ required: true })
  endAt!: Date;

  @Prop({ type: [Number], default: null })
  diceValues!: number[] | null;

  @Prop({ required: true, default: () => new Date() })
  createdAt!: Date;
}

export const RoundSchema = SchemaFactory.createForClass(Round);

// index for latest round per group
RoundSchema.index({ chatId: 1, startAt: -1 });
