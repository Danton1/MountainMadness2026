
export type BillCategory =
  | "House"
  | "Entertainment"
  | "Food"
  | "Education"
  | "Utilities"
  | "Transportation"
  | "Shopping"
  | "Others";

export type RecurrenceFreq = "none" | "weekly" | "monthly" | "yearly";

export type DbEvent = {
  id: string;
  user_id: string;
  title: string;
  type: "work" | "social" | "deadline" | "bill";
  start_at: string;
  end_at: string;
  amount_cents: number | null;
  bill_category: BillCategory | null;
  recur_freq: RecurrenceFreq | null;
  recur_interval: number | null;
  recur_until: string | null; // YYYY-MM-DD
};

export type Party = {
  id: string;
  name: string;
  join_code: string;
  weekly_goal_cents: number;
  created_by: string;
};

export type PartyMember = {
  user_id: string;
  profiles: { display_name: string | null; avatar_url: string | null } | null;
};

export type Quest = {
  reward_points: number;
  est_saved_cents: number;
};

export type CompletionRow = {
  user_id: string;
  completed_day: string; // YYYY-MM-DD
  quests: Quest | null;
};

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  country: string;
};

export type MemberRow = {
  user_id: string;
  profiles: {
    display_name: string | null;
  } | null;
};

export type QuestCounts = {
  dailyCount: number;
  weeklyCount: number;
};