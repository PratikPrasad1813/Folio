export type Color = "violet" | "green" | "peach" | "blue" | "yellow" | "pink";
export type ProjectStatus = "Planning" | "In progress" | "On hold" | "Completed";
export type Priority = "Low" | "Medium" | "High";
export type Resource = "projects" | "tasks" | "ideas";
export type View = "overview" | "projects" | "tasks" | "ideas" | "calendar" | "settings";
export interface User { id: string; name: string; email: string; provider: string; weeklyGoal: number }
export interface Project { id: string; name: string; description: string; status: ProjectStatus; priority: Priority; color: Color; icon: string; category: string; dueDate: string | null; favorite: boolean; createdAt: string }
export interface Task { id: string; title: string; description: string; projectId: string | null; completed: boolean; priority: Priority; dueDate: string | null; completedAt: string | null; createdAt: string }
export interface Idea { id: string; title: string; description: string; color: Color; category: string; status: string; createdAt: string }
export interface Activity { id: string; text: string; type: string; createdAt: string }
export interface WorkspaceData { user: User; projects: Project[]; tasks: Task[]; ideas: Idea[]; activities: Activity[] }
export type Item = Project | Task | Idea;
export const COLORS: Color[] = ["violet", "green", "peach", "blue", "yellow", "pink"];
export const PROJECT_STATUSES: ProjectStatus[] = ["Planning", "In progress", "On hold", "Completed"];
export const IDEA_STATUSES = ["Just an idea", "Exploring", "Ready to start"];
export function dateKey(date: Date = new Date()): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export function formatDate(date: string | null, options?: Intl.DateTimeFormatOptions): string { if (!date) return "No due date"; return new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", options || { month: "short", day: "numeric" }); }
export function initials(name: string): string { return name.split(" ").filter(Boolean).map(n => n[0]).slice(0, 2).join("").toUpperCase(); }
export function projectProgress(projectId: string, tasks: Task[]): { total: number; done: number; percent: number } { const list = tasks.filter(t => t.projectId === projectId); const done = list.filter(t => t.completed).length; return { total: list.length, done, percent: list.length ? Math.round(done / list.length * 100) : 0 }; }
