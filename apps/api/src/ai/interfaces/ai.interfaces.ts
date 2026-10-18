export type TxType = 'INCOME' | 'EXPENSE';

export interface CategoryOption {
  id: string;
  name: string;
  type: TxType;
}

/** One queued job plus the *owner's own* categories (never another user's). */
export interface ClassificationInput {
  jobId: string;
  text: string;
  categories: CategoryOption[];
}

/** A job as shown to the model: a short per-request alias instead of the database id. */
export interface PreparedJob extends ClassificationInput {
  alias: string;
}

/** What is stored in AiJob.result and returned to the owner. Amount is in minor units (paise). */
export interface ClassificationResult {
  title: string;
  amount: number | null;
  type: TxType;
  categoryId: string | null;
  confidence: number;
  /** Machine-readable hints for the UI, e.g. AMOUNT_MISSING, LOW_CONFIDENCE, CATEGORY_UNMATCHED. */
  warnings: string[];
}

export type JobOutcome = { ok: true; result: ClassificationResult } | { ok: false; reason: string };

/** What the user sees for a queued entry. */
export type AiJobState = 'QUEUED' | 'PROCESSING' | 'SAVED' | 'NEEDS_REVIEW' | 'FAILED';

export interface AiSavedTransaction {
  id: string;
  title: string;
  amount: number;
  kind: string;
  accountName: string;
  categoryName: string | null;
}

export type AiJobView = {
  jobId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  state: AiJobState;
  inputText: string;
  result: ClassificationResult | null;
  /** Safe, user-facing explanation for FAILED / NEEDS_REVIEW entries. */
  error: string | null;
  /** Set once the transaction was created from this entry. */
  transaction: AiSavedTransaction | null;
  queuePosition: number | null;
  createdAt: Date;
  completedAt: Date | null;
};
