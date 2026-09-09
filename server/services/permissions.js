export const PERMISSIONS = Object.freeze({
  MONITOR_READ: "MONITOR_READ",
  LOGS_READ: "LOGS_READ",
  DOCKER_READ: "DOCKER_READ",
  NGINX_READ: "NGINX_READ",
  STATS_READ: "STATS_READ",
  ALERTS_READ: "ALERTS_READ",
  REMOTE_CONTROL: "REMOTE_CONTROL",
  DOCKER_CONTROL: "DOCKER_CONTROL",
  NGINX_CONTROL: "NGINX_CONTROL",
  SERVER_CONTROL: "SERVER_CONTROL",
});

const READ_PERMISSIONS = [PERMISSIONS.MONITOR_READ, PERMISSIONS.LOGS_READ, PERMISSIONS.DOCKER_READ, PERMISSIONS.NGINX_READ, PERMISSIONS.STATS_READ, PERMISSIONS.ALERTS_READ];
const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export function permissionsForRole(role) {
  if (role === "owner") return new Set(ALL_PERMISSIONS);
  if (role === "admin") return new Set(READ_PERMISSIONS);
  return new Set();
}

export function hasPermission(user, permission) {
  return Boolean(user) && permissionsForRole(user.role).has(permission);
}
