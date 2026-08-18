// Daily off-Render backup of the SQLite database, uploaded to Cloudinary.
//
// This is a *second, independent* copy of the data on top of Render's own
// automatic daily disk snapshots (https://render.com/docs/disks). The disk
// snapshot protects against disk corruption; it does NOT protect against
// losing access to the Render account, the service/disk being deleted, or
// anyone downgrading/removing the disk by mistake. Keeping a copy in a
// completely separate system (Cloudinary, which this app already has
// credentials for) covers that gap.
//
// Backups older than BACKUP_RETENTION_DAYS are deleted automatically so
// Cloudinary storage doesn't grow forever.
const fs = require('fs');
const os = require('os');
const path = require('path');
const cloudinary = require('cloudinary').v2;

const BACKUP_FOLDER = 'alliance-flow-backups';
const BACKUP_RETENTION_DAYS = 30;
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day
const BACKUP_HOUR_UTC = 3; // low-traffic hours for this team

// Uses better-sqlite3's own backup() API instead of just copying the raw
// .db file — this produces a consistent snapshot even while the app is
// actively reading/writing, so a backup can never be caught mid-write the
// way a plain file copy could be.
async function createBackupFile(db) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const tmpPath = path.join(os.tmpdir(), `pedidos-backup-${stamp}.db`);
  await db.backup(tmpPath);
  return { tmpPath, stamp };
}

async function uploadBackup(tmpPath, stamp) {
  return cloudinary.uploader.upload(tmpPath, {
    resource_type: 'raw',
    folder: BACKUP_FOLDER,
    public_id: `pedidos-${stamp}`,
    overwrite: false,
  });
}

// Cloudinary's list endpoint is paginated, so this walks every page under
// the backups folder rather than assuming they all fit in one request.
async function listAllBackupResources() {
  const resources = [];
  let nextCursor;
  do {
    const page = await cloudinary.api.resources({
      resource_type: 'raw',
      type: 'upload',
      prefix: `${BACKUP_FOLDER}/`,
      max_results: 500,
      next_cursor: nextCursor,
    });
    resources.push(...page.resources);
    nextCursor = page.next_cursor;
  } while (nextCursor);
  return resources;
}

async function deleteOldBackups() {
  const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const resources = await listAllBackupResources();
  const stale = resources.filter(r => new Date(r.created_at).getTime() < cutoff);
  if (stale.length > 0) {
    await cloudinary.api.delete_resources(stale.map(r => r.public_id), { resource_type: 'raw' });
  }
  return stale.length;
}

// Returns the current backup list, newest first — used by the admin-only
// verification route in server.js so this can be checked from the running
// app instead of trusting the schedule blindly.
async function listBackups() {
  const resources = await listAllBackupResources();
  return resources
    .map(r => ({ name: r.public_id, createdAt: r.created_at, bytes: r.bytes }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function runBackup(db) {
  const { tmpPath, stamp } = await createBackupFile(db);
  try {
    await uploadBackup(tmpPath, stamp);
    const deletedCount = await deleteOldBackups();
    console.log(`✅ Database backup uploaded to Cloudinary (${stamp}). Removed ${deletedCount} backup(s) older than ${BACKUP_RETENTION_DAYS} days.`);
  } finally {
    fs.unlink(tmpPath, () => {}); // best-effort cleanup of the local temp copy
  }
}

// Schedules the first run for the next occurrence of BACKUP_HOUR_UTC, then
// repeats every 24h from there, instead of just setInterval() from
// whatever moment the server happens to boot at.
function scheduleBackups(db) {
  if (process.env.NODE_ENV !== 'production') {
    console.log('ℹ️  Skipping DB backup schedule (not running in production).');
    return;
  }

  const now = new Date();
  const next = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), BACKUP_HOUR_UTC, 0, 0, 0
  ));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  const initialDelay = next.getTime() - now.getTime();

  console.log(`ℹ️  Database backup scheduled — first run at ${next.toISOString()}, then every 24h.`);
  setTimeout(() => {
    runBackup(db).catch(err => console.error('❌ Database backup failed:', err.message));
    setInterval(() => {
      runBackup(db).catch(err => console.error('❌ Database backup failed:', err.message));
    }, BACKUP_INTERVAL_MS);
  }, initialDelay);
}

module.exports = { scheduleBackups, runBackup, listBackups };
