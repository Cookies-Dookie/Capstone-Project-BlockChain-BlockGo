using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using System.Diagnostics;
using System.Globalization;
using System.Text.Json;

namespace Client_app.Controllers
{
    [Authorize(Roles = "system_admin")]
    [ApiController]
    [Route("api/[controller]")]
    public class SystemMonitoringController : ControllerBase
    {
        private const int CheckTimeoutSeconds = 5;
        private readonly NpgsqlDataSource _dataSource;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;
        private readonly ILogger<SystemMonitoringController> _logger;

        public SystemMonitoringController(
            NpgsqlDataSource dataSource,
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            ILogger<SystemMonitoringController> logger)
        {
            _dataSource = dataSource;
            _httpClientFactory = httpClientFactory;
            _configuration = configuration;
            _logger = logger;
        }

        [HttpGet("summary")]
        public async Task<IActionResult> GetSummary(CancellationToken cancellationToken)
        {
            var frontendUrl = GetConfiguredUrl("Monitoring:FrontendUrl", "FRONTEND_INTERNAL_URL")
                ?? "http://127.0.0.1:8080";
            var middlewareUrl = GetConfiguredUrl("Monitoring:MiddlewareUrl", "MIDDLEWARE_URL")
                ?? _configuration["Middleware:Url"]
                ?? "http://127.0.0.1:4000";
            var prometheusUrl = GetConfiguredUrl("Monitoring:PrometheusUrl", "PROMETHEUS_URL");

            var databaseTask = CheckDatabaseAsync(cancellationToken);
            var frontendTask = CheckHttpServiceAsync(
                "frontend",
                "Frontend Web",
                "React and Nginx",
                frontendUrl,
                "/nginx-health",
                cancellationToken);
            var middlewareTask = CheckHttpServiceAsync(
                "middleware",
                "Middleware API",
                "Fabric gateway and wallet services",
                middlewareUrl,
                "/api/ready",
                cancellationToken);
            var prometheusTask = CheckPrometheusAsync(prometheusUrl, cancellationToken);

            await Task.WhenAll(databaseTask, frontendTask, middlewareTask, prometheusTask);

            var database = await databaseTask;
            var prometheus = await prometheusTask;
            var services = new List<ServiceSnapshot>
            {
                new(
                    "backend",
                    "C# Backend API",
                    "Monitoring and application services",
                    "healthy",
                    0,
                    "Monitoring endpoint is responding.",
                    "/api/SystemMonitoring/summary",
                    DateTimeOffset.UtcNow),
                await frontendTask,
                await middlewareTask,
                new(
                    "postgresql",
                    "PostgreSQL",
                    "Application data store",
                    database.Status,
                    database.LatencyMs,
                    database.Message,
                    "internal database check",
                    database.CheckedAt),
                prometheus.Service
            };

            var coreDown = services.Any(service =>
                service.Id != "prometheus" && service.Status == "down");
            var overallStatus = coreDown
                ? "down"
                : services.Any(service => service.Status != "healthy")
                    ? "warning"
                    : "healthy";

            return Ok(new
            {
                status = overallStatus,
                generatedAt = DateTimeOffset.UtcNow,
                refreshIntervalSeconds = 30,
                services,
                runtime = GetRuntimeSnapshot(),
                database,
                infrastructure = prometheus.Infrastructure,
                alerts = prometheus.Alerts
            });
        }

        private string? GetConfiguredUrl(string configurationKey, string environmentKey)
        {
            var value = _configuration[configurationKey]
                ?? Environment.GetEnvironmentVariable(environmentKey);
            return string.IsNullOrWhiteSpace(value) ? null : value.Trim().TrimEnd('/');
        }

        private async Task<ServiceSnapshot> CheckHttpServiceAsync(
            string id,
            string name,
            string layer,
            string baseUrl,
            string path,
            CancellationToken cancellationToken)
        {
            var startedAt = Stopwatch.GetTimestamp();
            var checkedAt = DateTimeOffset.UtcNow;

            try
            {
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                timeout.CancelAfter(TimeSpan.FromSeconds(CheckTimeoutSeconds));
                using var response = await _httpClientFactory.CreateClient()
                    .GetAsync($"{baseUrl.TrimEnd('/')}{path}", timeout.Token);
                var latencyMs = (long)Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds;

                return response.IsSuccessStatusCode
                    ? new ServiceSnapshot(id, name, layer, "healthy", latencyMs, "Service is responding.", path, checkedAt)
                    : new ServiceSnapshot(id, name, layer, "down", latencyMs, $"Returned HTTP {(int)response.StatusCode}.", path, checkedAt);
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                return new ServiceSnapshot(id, name, layer, "down", null, "Health check timed out.", path, checkedAt);
            }
            catch (Exception ex) when (ex is HttpRequestException or InvalidOperationException or UriFormatException)
            {
                _logger.LogWarning(ex, "Monitoring check failed for {ServiceId}.", id);
                return new ServiceSnapshot(id, name, layer, "down", null, "Service could not be reached.", path, checkedAt);
            }
        }

        private async Task<DatabaseSnapshot> CheckDatabaseAsync(CancellationToken cancellationToken)
        {
            var startedAt = Stopwatch.GetTimestamp();
            var checkedAt = DateTimeOffset.UtcNow;

            try
            {
                await using var connection = await _dataSource.OpenConnectionAsync(cancellationToken);
                await using var command = new NpgsqlCommand(@"
                    SELECT current_database(),
                           pg_database_size(current_database()),
                           (SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database())", connection);
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                await reader.ReadAsync(cancellationToken);

                return new DatabaseSnapshot(
                    "healthy",
                    "Database is responding.",
                    reader.GetString(0),
                    reader.GetInt64(1),
                    reader.GetInt64(2),
                    (long)Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds,
                    checkedAt);
            }
            catch (Exception ex) when (ex is NpgsqlException or TimeoutException)
            {
                _logger.LogWarning(ex, "System monitoring database check failed.");
                return new DatabaseSnapshot(
                    "down",
                    "Database check failed.",
                    null,
                    null,
                    null,
                    null,
                    checkedAt);
            }
        }

        private async Task<PrometheusSnapshot> CheckPrometheusAsync(
            string? prometheusUrl,
            CancellationToken cancellationToken)
        {
            if (prometheusUrl == null)
            {
                return new PrometheusSnapshot(
                    new ServiceSnapshot(
                        "prometheus",
                        "Prometheus",
                        "Cluster, workload, and Fabric metrics",
                        "not_configured",
                        null,
                        "Prometheus URL is not configured.",
                        "internal metrics service",
                        DateTimeOffset.UtcNow),
                    new InfrastructureSnapshot("not_configured", null, null, null, null),
                    Array.Empty<AlertSnapshot>());
            }

            var service = await CheckHttpServiceAsync(
                "prometheus",
                "Prometheus",
                "Cluster, workload, and Fabric metrics",
                prometheusUrl,
                "/-/ready",
                cancellationToken);

            if (service.Status != "healthy")
            {
                return new PrometheusSnapshot(
                    service,
                    new InfrastructureSnapshot("unavailable", null, null, null, null),
                    Array.Empty<AlertSnapshot>());
            }

            var cpuTask = QueryPrometheusMetricAsync(prometheusUrl,
                """sum(rate(container_cpu_usage_seconds_total{namespace=~"plv-(fabric|main-campus|annex-campus|pubad-campus)",container!="",container!="POD"}[5m]))""",
                cancellationToken);
            var memoryTask = QueryPrometheusMetricAsync(prometheusUrl,
                """sum(container_memory_working_set_bytes{namespace=~"plv-(fabric|main-campus|annex-campus|pubad-campus)",container!="",container!="POD"})""",
                cancellationToken);
            var podsTask = QueryPrometheusMetricAsync(prometheusUrl,
                """sum(kube_pod_status_phase{namespace=~"plv-(fabric|main-campus|annex-campus|pubad-campus)",phase="Running"} == 1)""",
                cancellationToken);
            var fabricTask = QueryPrometheusMetricAsync(prometheusUrl,
                """sum(up{job=~"fabric-peer|fabric-orderer"})""",
                cancellationToken);
            var alertsTask = GetPrometheusAlertsAsync(prometheusUrl, cancellationToken);

            await Task.WhenAll(cpuTask, memoryTask, podsTask, fabricTask, alertsTask);
            var infrastructure = new InfrastructureSnapshot(
                "prometheus",
                await cpuTask,
                await memoryTask,
                await podsTask,
                await fabricTask);

            if (infrastructure.CpuCores == null
                && infrastructure.MemoryBytes == null
                && infrastructure.RunningPods == null
                && infrastructure.HealthyFabricTargets == null)
            {
                service = service with
                {
                    Status = "warning",
                    Message = "Prometheus is ready, but the configured platform metrics are unavailable."
                };
            }

            return new PrometheusSnapshot(service, infrastructure, await alertsTask);
        }

        private async Task<double?> QueryPrometheusMetricAsync(
            string prometheusUrl,
            string query,
            CancellationToken cancellationToken)
        {
            try
            {
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                timeout.CancelAfter(TimeSpan.FromSeconds(CheckTimeoutSeconds));
                var endpoint = $"{prometheusUrl}/api/v1/query?query={Uri.EscapeDataString(query)}";
                using var response = await _httpClientFactory.CreateClient().GetAsync(endpoint, timeout.Token);
                if (!response.IsSuccessStatusCode) return null;

                var body = await response.Content.ReadAsStringAsync(timeout.Token);
                using var document = JsonDocument.Parse(body);
                var result = document.RootElement.GetProperty("data").GetProperty("result");
                if (result.GetArrayLength() == 0) return null;

                var value = result[0].GetProperty("value")[1].GetString();
                return double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed)
                    ? parsed
                    : null;
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                return null;
            }
            catch (Exception ex) when (ex is HttpRequestException or JsonException or InvalidOperationException or UriFormatException or KeyNotFoundException)
            {
                _logger.LogDebug(ex, "Prometheus metric query failed.");
                return null;
            }
        }

        private async Task<IReadOnlyList<AlertSnapshot>> GetPrometheusAlertsAsync(
            string prometheusUrl,
            CancellationToken cancellationToken)
        {
            try
            {
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                timeout.CancelAfter(TimeSpan.FromSeconds(CheckTimeoutSeconds));
                using var response = await _httpClientFactory.CreateClient()
                    .GetAsync($"{prometheusUrl}/api/v1/alerts", timeout.Token);
                if (!response.IsSuccessStatusCode) return Array.Empty<AlertSnapshot>();

                var body = await response.Content.ReadAsStringAsync(timeout.Token);
                using var document = JsonDocument.Parse(body);
                var alerts = document.RootElement.GetProperty("data").GetProperty("alerts");
                var snapshots = new List<AlertSnapshot>();

                foreach (var alert in alerts.EnumerateArray().Take(100))
                {
                    var labels = alert.GetProperty("labels");
                    alert.TryGetProperty("annotations", out var annotations);
                    snapshots.Add(new AlertSnapshot(
                        GetJsonString(labels, "alertname") ?? "Unnamed alert",
                        GetJsonString(labels, "severity") ?? "warning",
                        GetJsonString(labels, "component") ?? "platform",
                        GetJsonString(alert, "state") ?? "unknown",
                        GetJsonString(annotations, "summary") ?? "No alert summary provided.",
                        GetJsonString(alert, "activeAt")));
                }

                return snapshots;
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                return Array.Empty<AlertSnapshot>();
            }
            catch (Exception ex) when (ex is HttpRequestException or JsonException or InvalidOperationException or UriFormatException or KeyNotFoundException)
            {
                _logger.LogDebug(ex, "Prometheus alert query failed.");
                return Array.Empty<AlertSnapshot>();
            }
        }

        private static string? GetJsonString(JsonElement element, string propertyName)
        {
            return element.ValueKind == JsonValueKind.Object
                && element.TryGetProperty(propertyName, out var value)
                && value.ValueKind == JsonValueKind.String
                    ? value.GetString()
                    : null;
        }

        private static RuntimeSnapshot GetRuntimeSnapshot()
        {
            using var process = Process.GetCurrentProcess();
            return new RuntimeSnapshot(
                Environment.TickCount64 / 1000,
                process.WorkingSet64,
                GC.GetTotalMemory(false),
                process.Threads.Count,
                Environment.ProcessorCount);
        }

        public sealed record ServiceSnapshot(
            string Id,
            string Name,
            string Layer,
            string Status,
            long? LatencyMs,
            string Message,
            string Target,
            DateTimeOffset CheckedAt);

        public sealed record DatabaseSnapshot(
            string Status,
            string Message,
            string? Name,
            long? SizeBytes,
            long? ActiveConnections,
            long? LatencyMs,
            DateTimeOffset CheckedAt);

        public sealed record RuntimeSnapshot(
            long UptimeSeconds,
            long WorkingSetBytes,
            long ManagedMemoryBytes,
            int ThreadCount,
            int ProcessorCount);

        public sealed record InfrastructureSnapshot(
            string Source,
            double? CpuCores,
            double? MemoryBytes,
            double? RunningPods,
            double? HealthyFabricTargets);

        public sealed record AlertSnapshot(
            string Name,
            string Severity,
            string Component,
            string State,
            string Summary,
            string? ActiveAt);

        private sealed record PrometheusSnapshot(
            ServiceSnapshot Service,
            InfrastructureSnapshot Infrastructure,
            IReadOnlyList<AlertSnapshot> Alerts);
    }
}
