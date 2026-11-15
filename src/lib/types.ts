/** Shapes shared by the API and the UI. */
export type TokenStatus = "waiting" | "serving" | "served" | "cancelled" | "no_show";

export type TokenDTO = {
  id: string;
  code: string;
  number: number;
  name: string;
  phone?: string;
  note?: string;
  priority: boolean;
  status: TokenStatus;
  counter?: number;
  publicKey: string;
  createdAt: string;
  calledAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  /** Waiting tokens only: estimated seconds until called. */
  etaSec?: number;
};

export type ActivityDTO = {
  id: string;
  type: string;
  code?: string;
  counter?: number;
  at: string;
};

export type QueueSummary = {
  id: string;
  name: string;
  prefix: string;
  counters: number;
  createdAt: string;
};

export type QueueSnapshot = {
  queue: QueueSummary;
  waiting: TokenDTO[];
  serving: TokenDTO[];
  recent: TokenDTO[];
  activity: ActivityDTO[];
  stats: {
    waiting: number;
    servedToday: number;
    cancelledToday: number;
    avgWaitTodaySec: number | null;
    avgServiceSec: number;
  };
};

export type QueueListItem = QueueSummary & {
  waiting: number;
  serving: number;
  servedToday: number;
  avgWaitTodaySec: number | null;
  nowServing: string[];
};

export type DisplaySnapshot = {
  queue: { name: string; prefix: string; counters: number };
  serving: { code: string; counter: number }[];
  upNext: { code: string; priority: boolean }[];
  waiting: number;
  avgServiceSec: number;
  /** Latest call/recall, used by the display board to trigger announcements. */
  lastCall: { id: string; code: string; counter: number; at: string } | null;
};

export type TrackerSnapshot = {
  code: string;
  name: string;
  status: TokenStatus;
  queueName: string;
  queueId: string;
  ahead: number;
  etaSec: number | null;
  counter?: number;
  nowServing: { code: string; counter: number }[];
  createdAt: string;
  calledAt?: string;
};
