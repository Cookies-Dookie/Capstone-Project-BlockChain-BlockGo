# BlockGO Middleware Operations Runbook

## Memory Alerts

1. Check pod memory and restarts:

   ```bash
   kubectl top pods -n plv-fabric -l app=middleware-api
   kubectl get pods -n plv-fabric -l app=middleware-api -o wide
   kubectl describe pod -n plv-fabric -l app=middleware-api
   ```

2. Check recent logs:

   ```bash
   kubectl logs -n plv-fabric deployment/middleware-api --tail=300
   kubectl logs -n plv-fabric deployment/middleware-api --previous --tail=300
   ```

3. Check OOM or eviction events:

   ```bash
   kubectl get events -n plv-fabric --sort-by=.lastTimestamp | grep -Ei "oom|evict|memory|middleware-api"
   ```

4. Inspect middleware metrics:

   ```bash
   kubectl port-forward -n plv-fabric svc/middleware-api 4000:4000
   curl http://127.0.0.1:4000/metrics
   ```

## Heap Snapshot

Heap snapshots are disabled unless `DEBUG_TOKEN` is set on the middleware pod.

```bash
kubectl port-forward -n plv-fabric svc/middleware-api 4000:4000
curl "http://127.0.0.1:4000/debug/heapsnapshot?token=$DEBUG_TOKEN" -o heap.heapsnapshot
```

Open the snapshot in Chrome DevTools and compare retained objects across two snapshots taken after comparable traffic.

## Docker Checks

```bash
docker stats blockgo-middleware --no-stream
docker top blockgo-middleware
docker exec blockgo-middleware node -e "console.log(process.memoryUsage())"
```

## Emergency Mitigation

1. Confirm whether memory is still rising after the gateway cache reaches steady state.
2. If the pod is close to OOM, temporarily raise the memory limit and roll the deployment.
3. If restarts continue, capture `--previous` logs and a heap snapshot before replacing pods.
4. Revert temporary limits after the leak source is fixed and a load test shows flat memory growth.
