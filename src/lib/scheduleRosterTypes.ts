export type RosterProfile = {
  id: string;
  full_name: string;
  department: string;
  position: string;
  email: string;
  schedule_sort_order: number;
  include_in_work_schedule: boolean;
  is_schedule_only: boolean;
};
