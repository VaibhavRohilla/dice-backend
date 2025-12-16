export type RoundRow = {
  id: string;
  chat_id: number;
  created_by: number;
  start_at: string;
  end_at: string;
  dice_values: number[] | null;
  created_at: string;
};

export type RoundRecord = {
  id: string;
  chatId: number;
  createdBy: number;
  startAt: Date;
  endAt: Date;
  diceValues: number[] | null;
  createdAt: Date;
};

