export interface MaintenanceTask {
  name: string;
  isDue(now: Date): Promise<boolean> | boolean;
  run(now: Date): Promise<void>;
}
