export type TaskStatus = 'por_hacer' | 'en_curso' | 'en_revision' | 'hecha';
export type TaskPriority = 'baja' | 'media' | 'alta';
export type TagColor = 'sky' | 'rose' | 'amber' | 'emerald' | 'violet' | 'slate';

export interface TaskTag {
  id: number;
  name: string;
  color: TagColor | string;
}

export interface TaskChecklistItem {
  id: number;
  task_id: number;
  title: string;
  is_completed: boolean;
  position: number;
  created_at: string;
  updated_at?: string;
}

export interface TaskComment {
  id: number;
  task_id: number;
  user_id: number;
  user_name: string;
  user_avatar?: string | null;
  content: string;
  created_at: string;
  updated_at?: string;
}

export interface TaskLink {
  id: number;
  task_id: number;
  url: string;
  title: string | null;
  created_by: number | null;
  created_by_name?: string | null;
  created_at: string;
}

export interface TaskEvent {
  id: number;
  task_id: number;
  user_id?: number | null;
  user_name?: string | null;
  event_type: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  position: number;
  priority: TaskPriority;
  due_date: string | null;
  project_id: number | null;
  project_name?: string | null;
  assigned_to: number | null;
  assigned_to_name?: string | null;
  assigned_to_email?: string | null;
  created_by: number;
  created_by_name?: string | null;
  completed_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  checklist_total?: number;
  checklist_completed?: number;
  comments_count?: number;
  links_count?: number;
  tags?: TaskTag[];
}

/** La tarjeta abierta: con todo lo que cuelga de ella. */
export interface TaskDetail extends Task {
  checklist: TaskChecklistItem[];
  comments: TaskComment[];
  tags: TaskTag[];
  links: TaskLink[];
  events: TaskEvent[];
}

export interface Assignee {
  id: number;
  nombre: string;
  email: string;
  role: string;
}

export interface TagName {
  name: string;
  total: number;
}

export interface TeamMemberMetric {
  user_id: number;
  user_name: string;
  user_email: string;
  user_role: string;
  open_tasks: number;
  overdue_tasks: number;
  completed_this_week: number;
  completed_this_month: number;
}
