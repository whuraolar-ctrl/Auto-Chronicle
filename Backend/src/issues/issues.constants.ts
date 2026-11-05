export const ISSUE_CATEGORIES = [
  'warning_light',
  'strange_sound',
  'car_feels_different',
  'leak_or_unusual_smell',
  'engine_or_starting_problem',
  'brakes_or_braking',
  'steering_or_handling',
  'tire_or_wheel_problem',
  'battery_or_electrical_issue',
  'heating_or_air_conditioning',
  'bodywork_or_windscreen',
  'something_else',
] as const;

export const ISSUE_SEVERITIES = [
  'can_still_drive',
  'drive_with_care',
  'cannot_be_driven',
  'not_sure',
] as const;

export const ISSUE_TIMINGS = [
  'intermittent',
  'constant',
  'when_starting',
  'while_driving',
  'when_braking',
] as const;

export const ISSUE_STATUSES = [
  'reported',
  'being_checked',
  'being_fixed',
  'fixed',
] as const;

export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];
export type IssueTiming = (typeof ISSUE_TIMINGS)[number];
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

/** * Which status an issue may move to next. Moves. */
export const ALLOWED_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  reported: ['being_checked', 'being_fixed', 'fixed'],
  being_checked: ['being_fixed', 'fixed'],
  being_fixed: ['fixed'],
  fixed: [],
};

export const ISSUE_COLUMNS =
  'id, vehicle_id, fleet_id, reported_by, category, severity, timing, description, odometer_reading, occurred_at, status, source_driver_report_id, reported_at, created_at, updated_at';
