export type JobStatus = 'queued' | 'running' | 'finished' | 'failed';

export interface Job {
  id: string;
  source_url: string;
  requested_title: string | null;
  status: JobStatus;
  progress: string | null;
  track_id: string | null;
  error: string | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  custom_filename: boolean;
}

export interface Track {
  id: string;
  title: string;
  filename: string;
  source_url: string;
  created_at: number;
  bytes: number;
  duration_seconds: number | null;
}
