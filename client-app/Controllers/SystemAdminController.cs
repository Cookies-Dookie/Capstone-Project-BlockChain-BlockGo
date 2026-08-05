using Client_app.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Linq;
using Client_app.Models;
using System.Text.Json;
using System.Reflection;

namespace Client_app.Controllers;

[ApiController]
[Route("api/system-admin")]
[Authorize(Roles = "system_admin")]
public sealed class SystemAdminController : ControllerBase
{
    private readonly IConfiguration _configuration;
    private readonly TrafficMetrics _trafficMetrics;
    private readonly ILogger<SystemAdminController> _logger;

    public SystemAdminController(IConfiguration configuration, TrafficMetrics trafficMetrics, ILogger<SystemAdminController> logger)
    {
        _configuration = configuration;
        _trafficMetrics = trafficMetrics;
        _logger = logger;
    }

    [HttpGet("analytics")]
    public IActionResult Analytics() => Ok(_trafficMetrics.Snapshot());

    [HttpGet("security")]
    public IActionResult Security() => Ok(new
    {
        suspiciousSources = _trafficMetrics.SecuritySnapshot(),
        policy = "A source is flagged after 100 requests/minute or 20 server errors/minute. This is a signal for investigation, not an automatic block."
    });

    [HttpGet("health")]
    public async Task<IActionResult> Health()
    {
        var database = "unknown";
        try
        {
            await using var connection = new NpgsqlConnection(_configuration.GetConnectionString("MasterConnection"));
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand("SELECT 1", connection);
            await command.ExecuteScalarAsync();
            database = "healthy";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "System admin health check could not reach PostgreSQL.");
            database = "unhealthy";
        }

        return Ok(new
        {
            service = "healthy",
            database,
            environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production",
            processUptimeSeconds = Math.Round(Environment.TickCount64 / 1000d),
            checkedAt = DateTime.UtcNow
        });
    }

    [HttpGet("logs")]
    public IActionResult Logs([FromQuery] int lines = 200)
    {
        lines = Math.Clamp(lines, 1, 500);
        var logDirectory = Path.Combine(Directory.GetCurrentDirectory(), "logs");
        var file = Directory.Exists(logDirectory)
            ? Directory.GetFiles(logDirectory, "app-*.txt").OrderByDescending(System.IO.File.GetLastWriteTimeUtc).FirstOrDefault()
            : null;
        var content = file == null ? Array.Empty<string>() : System.IO.File.ReadLines(file).TakeLast(lines).ToArray();
        return Ok(new { file = file == null ? null : Path.GetFileName(file), lines = content });
    }

    // A browser-accessible arbitrary shell is intentionally not provided. These
    // named diagnostics are safe, read-only equivalents for GKE/Windows checks.
    [HttpGet("diagnostics/{target}")]
    public IActionResult Diagnostics(string target)
    {
        var normalizedTarget = target.ToLowerInvariant();
        object result = normalizedTarget switch
        {
            "windows" => (object)new { target = normalizedTarget, output = $"host={Environment.MachineName}\nos={Environment.OSVersion}\nuser={Environment.UserName}", readOnly = true },
            "gke" => (object)new { target = normalizedTarget, output = "kubectl access is managed out-of-band. Use kubectl with your cluster credentials; web shell execution is disabled.", readOnly = true },
            "memory" => (object)new { target = normalizedTarget, report = GetMemoryReport(), readOnly = true },
            "scaling" => (object)new { target = normalizedTarget, report = GetScalingReport(), readOnly = true },
            "cloudflare" => (object)new { target = normalizedTarget, report = GetCloudflareReport(), readOnly = true },
            "baseline" => (object)new { target = normalizedTarget, report = GetBaselineReport(), readOnly = true },
            _ => (object)new { target = normalizedTarget, output = "Available diagnostics: windows, gke, memory, scaling, cloudflare, baseline", readOnly = true }
        };

        return Ok(result);

        object GetMemoryReport()
        {
            using var proc = Process.GetCurrentProcess();
            var workingSetMb = Math.Round(proc.WorkingSet64 / 1024d / 1024d, 1);
            var privateMemoryMb = Math.Round(proc.PrivateMemorySize64 / 1024d / 1024d, 1);
            var gcTotalMemoryMb = Math.Round(GC.GetTotalMemory(false) / 1024d / 1024d, 1);
            var hasHighMemory = privateMemoryMb > 800 || workingSetMb > 900;
            var gcGen2 = GC.CollectionCount(2);
            var symptoms = new List<string>();

            if (hasHighMemory)
            {
                symptoms.Add("High process memory usage detected; investigate possible leaks or retention.");
            }

            if (gcGen2 > 100)
            {
                symptoms.Add("Frequent Gen2 garbage collection may indicate large object allocation or retention.");
            }

            if (proc.Threads.Count > 150)
            {
                symptoms.Add("High thread count detected; confirm there are no runaway thread or socket leaks.");
            }

            if (symptoms.Count == 0)
            {
                symptoms.Add("No obvious memory leak symptoms were detected in the current process snapshot.");
            }

            return new
            {
                processId = proc.Id,
                workingSetMb,
                privateMemoryMb,
                virtualMemoryMb = Math.Round(proc.VirtualMemorySize64 / 1024d / 1024d, 1),
                gcTotalMemoryMb,
                gcCollections = new
                {
                    gen0 = GC.CollectionCount(0),
                    gen1 = GC.CollectionCount(1),
                    gen2 = gcGen2
                },
                threadCount = proc.Threads.Count,
                processUptimeSeconds = (DateTime.UtcNow - proc.StartTime.ToUniversalTime()).TotalSeconds,
                runtime = RuntimeInformation.FrameworkDescription,
                os = RuntimeInformation.OSDescription,
                symptoms
            };
        }

        object GetScalingReport()
        {
            var kubernetes = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("KUBERNETES_SERVICE_HOST"));
            var @namespace = Environment.GetEnvironmentVariable("NAMESPACE") ?? Environment.GetEnvironmentVariable("KUBERNETES_NAMESPACE");
            var nodeName = Environment.GetEnvironmentVariable("NODE_NAME");
            var guidance = new[]
            {
                "Confirm that the cluster autoscaler and HPA are configured for the deployment.",
                "Verify metrics-server or Prometheus adapter availability for autoscaling data.",
                "Check that resource requests and limits are set for the service pods.",
                "Review Kubernetes events for HPA errors or scheduling failures."
            };
            var warnings = new List<string>();
            if (!kubernetes)
            {
                warnings.Add("This service is not running inside Kubernetes, so pod scaling diagnostics are limited.");
            }
            if (string.IsNullOrEmpty(@namespace))
            {
                warnings.Add("Namespace was not detected from environment; ensure NAMESPACE or KUBERNETES_NAMESPACE is configured.");
            }
            if (string.IsNullOrEmpty(nodeName))
            {
                warnings.Add("Node name is unavailable; verify Kubernetes downward API exposes NODE_NAME.");
            }

            return new
            {
                kubernetes,
                host = Environment.GetEnvironmentVariable("HOSTNAME"),
                @namespace,
                nodeName,
                guidance,
                warnings
            };
        }

        object GetCloudflareReport()
        {
            var headers = Request.Headers
                .Where(h => h.Key.StartsWith("CF-", StringComparison.OrdinalIgnoreCase) || h.Key.Equals("X-Forwarded-For", StringComparison.OrdinalIgnoreCase) || h.Key.Equals("X-Real-IP", StringComparison.OrdinalIgnoreCase))
                .ToDictionary(h => h.Key, h => h.Value.ToString());
            var isCloudflare = headers.Any(h => h.Key.StartsWith("CF-", StringComparison.OrdinalIgnoreCase));
            var cacheStatus = headers.TryGetValue("CF-Cache-Status", out var cacheVal) ? cacheVal : "none";
            var edgeNotes = new List<string>();
            if (!isCloudflare)
            {
                edgeNotes.Add("No Cloudflare headers detected. Verify DNS and edge routing configuration.");
            }
            else
            {
                edgeNotes.Add("Cloudflare edge headers detected. Edge traffic is reaching this admin service.");
                if (cacheStatus.Equals("HIT", StringComparison.OrdinalIgnoreCase))
                {
                    edgeNotes.Add("Responses are being cached at the Cloudflare edge.");
                }
            }

            return new
            {
                isCloudflare,
                cacheStatus,
                headers,
                requestHost = Request.Host.Value,
                remoteIp = Request.HttpContext.Connection.RemoteIpAddress?.ToString(),
                notes = edgeNotes
            };
        }

        object GetBaselineReport()
        {
            var config = new
            {
                p95LatencyMs = _configuration.GetValue<int?>("PerformanceBaseline:P95LatencyMs") ?? 250,
                p99LatencyMs = _configuration.GetValue<int?>("PerformanceBaseline:P99LatencyMs") ?? 500,
                maxCpuPercent = _configuration.GetValue<int?>("PerformanceBaseline:MaxCpuPercent") ?? 70,
                maxMemoryMb = _configuration.GetValue<int?>("PerformanceBaseline:MaxMemoryMb") ?? 1024
            };

            var snapshotObj = _trafficMetrics.Snapshot();
            var current = MapToTrafficSnapshot(snapshotObj);

            return new
            {
                config,
                current,
                analysis = new
                {
                    requestLoadOk = (current?.RequestsToday ?? 0) <= 10000,
                    userLoadOk = (current?.ActiveUsers ?? 0) <= 200,
                    baselineComparison = new
                    {
                        requestsToday = (current?.RequestsToday ?? 0),
                        averageTrafficKb = (current?.AverageTrafficKb ?? 0),
                        activeUsers = (current?.ActiveUsers ?? 0)
                    }
                }
            };
        }
    }

    private static TrafficSnapshot? MapToTrafficSnapshot(object? snapshot)
    {
        if (snapshot == null) return null;

        if (snapshot is TrafficSnapshot ts) return ts;

        try
        {
            // If it's a JsonElement (anonymous object serialized), attempt to deserialize
            if (snapshot is JsonElement je)
            {
                var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                return JsonSerializer.Deserialize<TrafficSnapshot>(je.GetRawText(), opts);
            }

            if (snapshot is string s)
            {
                var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                return JsonSerializer.Deserialize<TrafficSnapshot>(s, opts);
            }

            // Try serialize-then-deserialize as fallback for anonymous types
            var serialized = JsonSerializer.Serialize(snapshot);
            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            var deserialized = JsonSerializer.Deserialize<TrafficSnapshot>(serialized, options);
            if (deserialized != null) return deserialized;

            // Last resort: use reflection to read likely property names
            var type = snapshot.GetType();
            int TryGetInt(params string[] names)
            {
                foreach (var n in names)
                {
                    var prop = type.GetProperty(n, BindingFlags.IgnoreCase | BindingFlags.Public | BindingFlags.Instance);
                    if (prop != null)
                    {
                        var val = prop.GetValue(snapshot);
                        if (val == null) continue;
                        if (val is int i) return i;
                        if (int.TryParse(Convert.ToString(val), out var parsed)) return parsed;
                    }
                }
                return 0;
            }

            double TryGetDouble(params string[] names)
            {
                foreach (var n in names)
                {
                    var prop = type.GetProperty(n, BindingFlags.IgnoreCase | BindingFlags.Public | BindingFlags.Instance);
                    if (prop != null)
                    {
                        var val = prop.GetValue(snapshot);
                        if (val == null) continue;
                        if (val is double d) return d;
                        if (double.TryParse(Convert.ToString(val), out var parsed)) return parsed;
                    }
                }
                return 0;
            }

            var result = new TrafficSnapshot
            {
                RequestsToday = TryGetInt("requestsToday", "RequestsToday", "requests_today"),
                ActiveUsers = TryGetInt("activeUsers", "ActiveUsers", "active_users"),
                AverageTrafficKb = TryGetDouble("averageTrafficKb", "AverageTrafficKb", "average_traffic_kb", "averageTrafficKb")
            };

            return result;
        }
        catch
        {
            return null;
        }
    }
}
