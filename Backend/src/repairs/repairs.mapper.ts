import { fromMinor, toMinor } from '../common/utils/money';

export type RepairRow = {
  id: string;
  vehicle_id: string;
  issue_id: string | null;
  recorded_by: string;
  work_performed: string;
  provider_name: string | null;
  repair_date: string;
  amount: number | string;
  currency: string;
  created_at: string;
  updated_at: string;
};

export type RepairPartRow = {
  id: string;
  repair_id: string;
  part_name: string;
  amount: number | string;
};

export type MediaRow = {
  id: string;
  repair_id: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number | string;
  created_at: string;
};

/** Receipt payload returned to the client. */
export type ReceiptResponse = {
  id: string;
  mimeType: string;
  fileSizeBytes: number;
  url: string;
  urlExpiresInSeconds: number;
  uploadedAt: string;
};

/** * extra.receipt is passed when one repair is returned (with. */
export function toRepairResponse(
  row: RepairRow,
  parts: RepairPartRow[],
  extra: { receipt?: ReceiptResponse | null; hasReceipt?: boolean } = {},
) {
  const partsMinor = parts.reduce(
    (sum, part) => sum + toMinor(part.amount, row.currency),
    0,
  );

  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    issueId: row.issue_id,
    recordedBy: row.recorded_by,
    workPerformed: row.work_performed,
    providerName: row.provider_name,
    repairDate: row.repair_date,
    amount: Number(row.amount),
    currency: row.currency,
    parts: parts.map((p) => ({
      id: p.id,
      partName: p.part_name,
      amount: Number(p.amount),
    })),
    // Part of the cost not assigned to any part (labour, etc.)
    unallocatedAmount: fromMinor(
      Math.max(0, toMinor(row.amount, row.currency) - partsMinor),
      row.currency,
    ),
    hasReceipt: extra.hasReceipt ?? !!extra.receipt,
    ...(extra.receipt !== undefined ? { receipt: extra.receipt } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
