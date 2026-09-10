import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { hmac } from "./crypto.js";

let previousCpuSample = null;

async function readText(file) {
  try { return (await fs.readFile(file, "utf8")).trim(); } catch { return null; }
}

async function thermalTemperature() {
  const value = await readText("/sys/class/thermal/thermal_zone0/temp");
  const temperature = Number(value);
  return Number.isFinite(temperature) ? Math.round(temperature / 100) / 10 : null;
}

async function cpuUsage() {
  const stat = await readText("/proc/stat");
  const fields = stat?.split("\n")[0]?.trim().split(/\s+/).slice(1).map(Number);
  if (!fields?.length || fields.some((value) => !Number.isFinite(value))) return null;
  const idle = (fields[3] || 0) + (fields[4] || 0);
  const total = fields.reduce((sum, value) => sum + value, 0);
  const current = { idle, total };
  const previous = previousCpuSample;
  previousCpuSample = current;
  if (!previous || current.total <= previous.total) return null;
  return Math.round((1 - (current.idle - previous.idle) / (current.total - previous.total)) * 1_000) / 10;
}

export async function systemSnapshot(dataPath) {
  const [uptimeRaw, bootId, temperature, stat, usagePercent] = await Promise.all([
    readText("/proc/uptime"), readText("/proc/sys/kernel/random/boot_id"), thermalTemperature(), fs.statfs(dataPath).catch(() => null), cpuUsage(),
  ]);
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const disk = stat ? { total: Number(stat.blocks) * Number(stat.bsize), free: Number(stat.bfree) * Number(stat.bsize), available: Number(stat.bavail) * Number(stat.bsize) } : null;
  let network = [];
  try {
    network = Object.entries(os.networkInterfaces()).map(([name, addresses]) => ({ name, addresses: (addresses || []).filter((entry) => !entry.internal).map(({ address, family, mac }) => ({ address, family, mac })) }));
  } catch { /* Network enumeration can be unavailable in a restricted container. */ }
  return {
    available: true,
    cpu: { model: os.cpus()[0]?.model || "unknown", cores: os.cpus().length, loadAverage: os.loadavg(), usagePercent },
    memory: { total: totalMem, free: freeMem, used: totalMem - freeMem, usedPercent: Math.round(((totalMem - freeMem) / totalMem) * 1000) / 10 },
    temperature: { available: temperature !== null, celsius: temperature },
    uptimeSeconds: Math.floor(Number(String(uptimeRaw || "0").split(" ")[0]) || os.uptime()),
    storage: disk ? { ...disk, used: disk.total - disk.free, usedPercent: Math.round(((disk.total - disk.free) / disk.total) * 1000) / 10, path: dataPath } : { available: false },
    network,
    architecture: process.arch,
    kernel: os.release(),
    hostname: os.hostname(),
    bootId,
    process: { pid: process.pid, node: process.version, uptimeSeconds: Math.floor(process.uptime()), memory: process.memoryUsage() },
  };
}

function dockerRequest(socketPath, pathname, method = "GET") {
  return new Promise((resolve, reject) => {
    const request = http.request({ socketPath, path: pathname, method, headers: { Accept: "application/json" }, timeout: 5_000 }, (response) => {
      let content = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { content += chunk; if (content.length > 2_000_000) response.destroy(new Error("Respuesta Docker demasiado grande.")); });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`Docker respondió ${response.statusCode}`));
        try { resolve(content ? JSON.parse(content) : {}); } catch { resolve({ raw: content }); }
      });
    });
    request.on("timeout", () => request.destroy(new Error("Tiempo de espera de Docker agotado.")));
    request.on("error", reject);
    request.end();
  });
}

function containerId(value) {
  const id = String(value || "");
  return /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(id) ? id : null;
}

export function createDockerService(config) {
  const unavailable = () => ({ available: false, reason: config.dockerEnabled ? "Docker no está disponible." : "DOCKER_ENABLED está desactivado." });
  async function list() {
    if (!config.dockerEnabled) return unavailable();
    try {
      const containers = await dockerRequest(config.dockerSocketPath, "/containers/json?all=1");
      const details = await Promise.all(containers.slice(0, 100).map(async (container) => {
        let stats = null;
        let inspect = null;
        try { stats = await dockerRequest(config.dockerSocketPath, `/containers/${encodeURIComponent(container.Id)}/stats?stream=false`); } catch { /* A stopped container has no stats. */ }
        try { inspect = await dockerRequest(config.dockerSocketPath, `/containers/${encodeURIComponent(container.Id)}/json`); } catch { /* Container could disappear while inspecting. */ }
        const cpuDelta = Number(stats?.cpu_stats?.cpu_usage?.total_usage || 0) - Number(stats?.precpu_stats?.cpu_usage?.total_usage || 0);
        const systemDelta = Number(stats?.cpu_stats?.system_cpu_usage || 0) - Number(stats?.precpu_stats?.system_cpu_usage || 0);
        const cpu = cpuDelta > 0 && systemDelta > 0 ? Math.round((cpuDelta / systemDelta) * Number(stats?.cpu_stats?.online_cpus || 1) * 10_000) / 100 : null;
        const memory = stats?.memory_stats?.usage || 0;
        return { id: container.Id, name: (container.Names?.[0] || "").replace(/^\//, ""), image: container.Image, state: container.State, status: container.Status, created: container.Created, restartCount: inspect?.RestartCount ?? null, startedAt: inspect?.State?.StartedAt ?? null, network: Object.keys(container.NetworkSettings?.Networks || {}), cpuPercent: cpu, memoryBytes: memory };
      }));
      return { available: true, containers: details };
    } catch { return unavailable(); }
  }
  async function control(idInput, action) {
    const id = containerId(idInput);
    if (!config.dockerEnabled || !id) throw new Error("Control Docker no disponible.");
    if (!config.dockerAllowedContainers.has(id)) throw new Error("Ese contenedor no está autorizado para control remoto.");
    const endpoint = action === "restart" ? `/containers/${encodeURIComponent(id)}/restart?t=20` : `/containers/${encodeURIComponent(id)}/${action}`;
    await dockerRequest(config.dockerSocketPath, endpoint, "POST");
    return { id, action };
  }
  return { list, control };
}

export function createHostControl(config) {
  async function send(action) {
    if (!config.hostControlEnabled || !config.hostControlSecret) throw new Error("El control del host no está configurado.");
    if (!["restart", "shutdown", "nginx-reload", "nginx-restart"].includes(action)) throw new Error("Acción de host no permitida.");
    const timestamp = Math.floor(Date.now() / 1_000);
    const nonce = crypto.randomBytes(18).toString("base64url");
    const body = { action, timestamp, nonce };
    body.signature = hmac(`${timestamp}.${nonce}.${action}`, config.hostControlSecret);
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(config.hostControlSocket);
      let response = "";
      socket.setTimeout(5_000);
      socket.on("connect", () => socket.end(`${JSON.stringify(body)}\n`));
      socket.on("data", (chunk) => { response += chunk; });
      socket.on("timeout", () => socket.destroy(new Error("El helper del host agotó el tiempo de espera.")));
      socket.on("error", reject);
      socket.on("close", () => { try { const data = JSON.parse(response); data.success ? resolve(data) : reject(new Error(data.error || "El helper rechazó la acción.")); } catch { reject(new Error("Respuesta inválida del helper del host.")); } });
    });
  }
  return { send };
}

export function nginxStatus(config) {
  return config.nginxEnabled ? { available: false, reason: "El estado Nginx requiere un helper local configurado." } : { available: false, reason: "Nginx no está habilitado en esta instalación." };
}

export class PowerMonitor {
  async read() {
    // Punto de extensión para un UPS, HAT, medidor USB o driver I²C real.
    // No debe devolver estimaciones cuando no existe un sensor instalado.
    return { available: false, watts: null, voltage: null, current: null, energyKwh: null, reason: "No hay un sensor, UPS, HAT o medidor USB configurado." };
  }
}

const powerMonitor = new PowerMonitor();

export function powerStatus() {
  return powerMonitor.read();
}
