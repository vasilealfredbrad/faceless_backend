import client from "prom-client";

const register = new client.Registry();

client.collectDefaultMetrics({ register });

export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status_code"] as const,
  registers: [register],
});

export const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route"] as const,
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const jobsProcessedTotal = new client.Counter({
  name: "jobs_processed_total",
  help: "Total jobs processed by the worker",
  labelNames: ["status"] as const,
  registers: [register],
});

export const jobDurationSeconds = new client.Histogram({
  name: "job_duration_seconds",
  help: "Job processing duration in seconds",
  labelNames: ["status", "duration_type"] as const,
  buckets: [10, 30, 60, 120, 180, 300, 600],
  registers: [register],
});

export const jobsInProgress = new client.Gauge({
  name: "jobs_in_progress",
  help: "Number of jobs currently being processed",
  registers: [register],
});

export const uploadSizeBytes = new client.Histogram({
  name: "upload_size_bytes",
  help: "Size of files uploaded to B2 in bytes",
  labelNames: ["file_type"] as const,
  buckets: [100_000, 500_000, 1_000_000, 5_000_000, 10_000_000, 50_000_000, 100_000_000],
  registers: [register],
});

export const uploadDurationSeconds = new client.Histogram({
  name: "upload_duration_seconds",
  help: "Time to upload a file to B2",
  labelNames: ["file_type"] as const,
  buckets: [1, 5, 10, 30, 60, 120, 300],
  registers: [register],
});

export const externalApiCalls = new client.Counter({
  name: "external_api_calls_total",
  help: "Total external API calls",
  labelNames: ["service", "success"] as const,
  registers: [register],
});

export const externalApiDuration = new client.Histogram({
  name: "external_api_duration_seconds",
  help: "External API call duration",
  labelNames: ["service"] as const,
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

export { register };
