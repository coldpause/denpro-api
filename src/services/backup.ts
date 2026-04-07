import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import cron, { ScheduledTask } from 'node-cron';

const execAsync = promisify(exec);

const BACKUP_DIR = path.join(process.cwd(), 'backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

export interface BackupFile {
  filename: string;
  sizeMB: string;
  createdAt: string;
}

export async function createBackup(): Promise<string> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${timestamp}.dump`;
  const filePath = path.join(BACKUP_DIR, filename);

  // Use custom format (-F c) for pg_dump which is required for pg_restore
  const command = `pg_dump "${dbUrl}" -F c -f "${filePath}"`;

  try {
    await execAsync(command);
    return filename;
  } catch (error: any) {
    console.error('Backup failed:', error);
    throw new Error(`Backup failed: ${error.message}`);
  }
}

export async function restoreBackup(filename: string): Promise<boolean> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  const filePath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error('Backup file not found');
  }

  // Use pg_restore --clean to drop database objects before recreating them
  const command = `pg_restore "${dbUrl}" --clean --if-exists -F c "${filePath}"`;

  try {
    await execAsync(command);
    return true;
  } catch (error: any) {
    console.error('Restore failed:', error);
    throw new Error(`Restore failed: ${error.message}`);
  }
}

export async function listBackups(): Promise<BackupFile[]> {
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    
    return files
      .filter((f) => f.endsWith('.dump'))
      .map((filename) => {
        const filePath = path.join(BACKUP_DIR, filename);
        const stats = fs.statSync(filePath);
        return {
          filename,
          sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
          createdAt: stats.birthtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.error('Failed to list backups:', error);
    return [];
  }
}

// Global backup task reference
let backupTask: ScheduledTask | null = null;

export function initializeBackupScheduler(cronExpression: string = '0 2 * * *') {
  // Stop existing task if any
  if (backupTask) {
    backupTask.stop();
  }

  console.log(`Starting automated daily backups at schedule: ${cronExpression}`);
  
  backupTask = cron.schedule(cronExpression, async () => {
    console.log('Running scheduled database backup...');
    try {
      const filename = await createBackup();
      console.log(`Scheduled backup successful: ${filename}`);
    } catch (err) {
      console.error('Scheduled backup encountered an error:', err);
    }
  });
}
