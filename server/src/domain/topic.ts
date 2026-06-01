export type Topic = {
  id: string;
  userId: string | null;
  name: string;
  color: string | null;
  createdAt: Date;
};

export type CreateTopicInput = {
  userId?: string | null;
  name: string;
  color?: string | null;
};

export type UpdateTopicInput = {
  name?: string;
  color?: string | null;
};
