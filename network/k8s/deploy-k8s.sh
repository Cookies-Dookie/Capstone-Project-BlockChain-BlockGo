#!/bin/bash

# Deploy PLV BLOCKGO Multi-Campus Fabric Network to Kubernetes.
# Usage:
#   ./k8s/deploy-k8s.sh local apply
#   ./k8s/deploy-k8s.sh production apply
#   ./k8s/deploy-k8s.sh local verify
#   ./k8s/deploy-k8s.sh production status
#   ./k8s/deploy-k8s.sh local delete

set -euo pipefail

cd "$(dirname "$0")/.."

PROFILE="${K8S_PROFILE:-local}"
ACTION="${1:-apply}"
ROLLOUT_TIMEOUT="${ROLLOUT_TIMEOUT:-20m}"
PRODUCTION_IMAGE_REPOSITORY="${PRODUCTION_IMAGE_REPOSITORY:-}"
PRODUCTION_IMAGE_TAG="${PRODUCTION_IMAGE_TAG:-}"
LOCAL_IMAGE_TAG="${LOCAL_IMAGE_TAG:-blockgo-local-$(date -u +%Y%m%d%H%M%S)}"

if [[ "${1:-}" == "local" || "${1:-}" == "production" ]]; then
    PROFILE="$1"
    ACTION="${2:-apply}"
elif [[ "${2:-}" == "local" || "${2:-}" == "production" ]]; then
    PROFILE="$2"
elif [[ "${1:-}" == "apply" || "${1:-}" == "delete" || "${1:-}" == "status" || "${1:-}" == "verify" ]]; then
    ACTION="$1"
elif [[ "${2:-}" == "apply" || "${2:-}" == "delete" || "${2:-}" == "status" || "${2:-}" == "verify" ]]; then
    ACTION="$2"
fi

case "$PROFILE" in
    local|production) ;;
    *)
        echo "ERROR: Profile must be 'local' or 'production'."
        exit 1
        ;;
esac

case "$ACTION" in
    apply|delete|status|verify) ;;
    *)
        echo "Usage: $0 [local|production] [apply|delete|status|verify]"
        exit 1
        ;;
esac

export PROFILE
export K8S_PROFILE="$PROFILE"

# Docker Desktop 4.80 with Kubernetes 1.36 cannot proxy the default WebSocket
# remote-command transport to cri-dockerd. Keep the local bootstrap usable via
# the compatible SPDY transport; callers can explicitly override this setting.
if [[ "$PROFILE" == "local" ]]; then
    export KUBECTL_REMOTE_COMMAND_WEBSOCKETS="${KUBECTL_REMOTE_COMMAND_WEBSOCKETS:-false}"
fi

NAMESPACES=(plv-fabric plv-main-campus plv-annex-campus plv-pubad-campus)
TMP_K8S_DIR="./k8s/.tmp-k8s"
LOCAL_STATIC_PVS=(
    pv-orderer-1
    pv-orderer-2
    pv-orderer-3
    pv-fabric-ca-registrar
    pv-fabric-ca-faculty
    pv-fabric-ca-department
    pv-peer-registrar-1
    pv-couchdb-registrar-1
    pv-couchdb-wallet-registrar
    pv-peer-faculty-1
    pv-couchdb-faculty-1
    pv-couchdb-wallet-faculty
    pv-peer-department-1
    pv-couchdb-department-1
    pv-couchdb-wallet-department
    pv-postgres-main
    pv-ipfs-1
    pv-ipfs-2
    pv-ipfs-3
    pv-couchdb-backup
)

echo "======================================"
echo "PLV BLOCKGO K8s Deployment Script"
echo "======================================"
echo "Profile: $PROFILE"
echo "Action: $ACTION"
echo ""

check_kubectl() {
    if ! command -v kubectl >/dev/null 2>&1; then
        echo "ERROR: kubectl not found. Please install kubectl."
        exit 1
    fi
    echo "kubectl is installed"
}

check_cluster() {
    if ! kubectl cluster-info >/dev/null 2>&1; then
        echo "ERROR: Cannot connect to Kubernetes cluster. Check your kubeconfig."
        exit 1
    fi
    echo "Connected to Kubernetes cluster"
}

apply_manifest() {
    local manifest="$1"
    if [[ ! -f "$manifest" ]]; then
        echo "ERROR: Manifest $manifest not found."
        exit 1
    fi
    kubectl apply -f "$manifest"
}

apply_manifest_if_exists() {
    local manifest="$1"
    if [[ -f "$manifest" ]]; then
        kubectl apply -f "$manifest"
    else
        echo "Manifest $manifest not found. Skipping."
    fi
}

deploy_observability() {
    local monitoring_dir="../monitoring"
    if [[ ! -f "$monitoring_dir/observability-stack.yaml" ]]; then
        echo "ERROR: Observability stack manifest not found."
        exit 1
    fi

    if ! kubectl get secret grafana-admin -n plv-fabric >/dev/null 2>&1; then
        if ! command -v openssl >/dev/null 2>&1; then
            echo "ERROR: openssl is required to generate the initial Grafana admin secret."
            exit 1
        fi
        local grafana_password
        grafana_password="$(openssl rand -hex 24)"
        kubectl create secret generic grafana-admin -n plv-fabric \
            --from-literal=admin-user=admin \
            --from-literal=admin-password="$grafana_password" >/dev/null
        unset grafana_password
        echo "Created the Grafana admin secret. Grafana remains accessible only through the System Admin proxy."
    fi

    kubectl create configmap prometheus-config -n plv-fabric \
        --from-file=prometheus.yml="$monitoring_dir/prometheus.yaml" \
        --from-file=alert-rules.yml="$monitoring_dir/alert-rules.yaml" \
        --dry-run=client -o yaml | kubectl apply -f -

    kubectl create configmap grafana-dashboards -n plv-fabric \
        --from-file="$monitoring_dir/grafana-dashboard.json" \
        --from-file="$monitoring_dir/grafana-kubernetes-memory.json" \
        --from-file="$monitoring_dir/grafana-api-observability.json" \
        --from-file="$monitoring_dir/grafana-fabric.json" \
        --from-file="$monitoring_dir/grafana-postgresql.json" \
        --from-file="$monitoring_dir/grafana-workflows.json" \
        --from-file="$monitoring_dir/grafana-logs.json" \
        --dry-run=client -o yaml | kubectl apply -f -

    kubectl apply -f "$monitoring_dir/observability-stack.yaml"
}

configure_local_observability_resources() {
    if [[ "$PROFILE" != "local" ]]; then
        return
    fi
    echo "Applying low scheduler requests for the single-node local observability stack..."
    local deployment
    for deployment in prometheus kube-state-metrics loki alloy grafana; do
        kubectl set resources deployment/$deployment -n plv-fabric \
            --requests=cpu=10m,memory=16Mi >/dev/null
    done
    kubectl set resources deployment/postgres-exporter -n plv-main-campus \
        --requests=cpu=10m,memory=16Mi >/dev/null
}

local_pv_root() {
    local path
    path="$(pwd)"

    local context
    context="$(kubectl config current-context 2>/dev/null || true)"

    if [[ "$context" == "docker-desktop" ]]; then
        if [[ "$path" =~ ^/mnt/([A-Za-z])/(.*)$ ]]; then
            local drive="${BASH_REMATCH[1],,}"
            echo "/run/desktop/mnt/host/${drive}/${BASH_REMATCH[2]}"
            return
        fi

        if [[ "$path" =~ ^/([A-Za-z])/(.*)$ ]]; then
            local drive="${BASH_REMATCH[1],,}"
            echo "/run/desktop/mnt/host/${drive}/${BASH_REMATCH[2]}"
            return
        fi

        if [[ "$path" =~ ^([A-Za-z]):[\\/](.*)$ ]]; then
            local drive="${BASH_REMATCH[1],,}"
            local rest="${BASH_REMATCH[2]//\\//}"
            echo "/run/desktop/mnt/host/${drive}/${rest}"
            return
        fi
    fi

    echo "$path"
}

local_recovery_path_for_claim() {
    local pv_root="$1"
    local namespace="$2"
    local claim="$3"

    case "$claim" in
        couchdb-wallet-storage-couchdb-wallet-registrar-0)
            echo "${pv_root}/fabric-k8s-data/couchdb-wallet-registrar"
            ;;
        couchdb-wallet-storage-couchdb-wallet-faculty-0)
            echo "${pv_root}/fabric-k8s-data/couchdb-wallet-faculty"
            ;;
        couchdb-wallet-storage-couchdb-wallet-department-0)
            echo "${pv_root}/fabric-k8s-data/couchdb-wallet-department"
            ;;
        *)
            echo "${pv_root}/fabric-k8s-data/recovered/${namespace}/${claim}"
            ;;
    esac
}

repair_lost_local_pvcs() {
    if [[ "$PROFILE" != "local" ]]; then
        return
    fi

    local pv_root
    pv_root="$(local_pv_root)"
    local namespace
    local claim
    local volume
    local claim_uid
    local storage_class
    local storage_size
    local recovery_path
    local referenced_namespace
    local referenced_claim
    local phase

    for namespace in "${NAMESPACES[@]}"; do
        while IFS= read -r claim; do
            [[ -z "$claim" ]] && continue

            volume="$(kubectl get pvc "$claim" -n "$namespace" -o jsonpath='{.spec.volumeName}')"
            claim_uid="$(kubectl get pvc "$claim" -n "$namespace" -o jsonpath='{.metadata.uid}')"
            storage_class="$(kubectl get pvc "$claim" -n "$namespace" -o jsonpath='{.spec.storageClassName}')"
            storage_size="$(kubectl get pvc "$claim" -n "$namespace" -o jsonpath='{.spec.resources.requests.storage}')"

            if [[ -z "$volume" || -z "$claim_uid" || -z "$storage_class" || -z "$storage_size" ]]; then
                echo "ERROR: Lost PVC ${namespace}/${claim} is missing binding metadata and cannot be repaired safely."
                return 1
            fi

            echo "Repairing Lost PVC ${namespace}/${claim} (volume ${volume})..."
            if kubectl get pv "$volume" >/dev/null 2>&1; then
                referenced_namespace="$(kubectl get pv "$volume" -o jsonpath='{.spec.claimRef.namespace}')"
                referenced_claim="$(kubectl get pv "$volume" -o jsonpath='{.spec.claimRef.name}')"
                if [[ "$referenced_namespace" != "$namespace" || "$referenced_claim" != "$claim" ]]; then
                    echo "ERROR: PV ${volume} is reserved for ${referenced_namespace}/${referenced_claim}; refusing to reassign it."
                    return 1
                fi
                kubectl patch pv "$volume" --type=merge \
                    -p "{\"spec\":{\"claimRef\":{\"apiVersion\":\"v1\",\"kind\":\"PersistentVolumeClaim\",\"name\":\"${claim}\",\"namespace\":\"${namespace}\",\"uid\":\"${claim_uid}\"}}}" >/dev/null
            else
                recovery_path="$(local_recovery_path_for_claim "$pv_root" "$namespace" "$claim")"
                echo "The old dynamic PV is gone; recreating ${volume} at retained path ${recovery_path}."
                cat <<EOF | kubectl apply -f - >/dev/null
apiVersion: v1
kind: PersistentVolume
metadata:
  name: ${volume}
spec:
  capacity:
    storage: ${storage_size}
  volumeMode: Filesystem
  accessModes:
  - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: ${storage_class}
  claimRef:
    apiVersion: v1
    kind: PersistentVolumeClaim
    namespace: ${namespace}
    name: ${claim}
    uid: ${claim_uid}
  hostPath:
    path: ${recovery_path}
    type: DirectoryOrCreate
EOF
            fi

            phase=""
            for _ in $(seq 1 30); do
                phase="$(kubectl get pvc "$claim" -n "$namespace" -o jsonpath='{.status.phase}' 2>/dev/null || true)"
                [[ "$phase" == "Bound" ]] && break
                sleep 2
            done
            if [[ "$phase" != "Bound" ]]; then
                echo "ERROR: PVC ${namespace}/${claim} remained ${phase:-Unknown} after recovery."
                kubectl describe pvc "$claim" -n "$namespace" || true
                return 1
            fi
        done < <(
            kubectl get pvc -n "$namespace" \
                -o jsonpath='{range .items[?(@.status.phase=="Lost")]}{.metadata.name}{"\n"}{end}' 2>/dev/null || true
        )
    done
}

wait_rollout() {
    local resource="$1"
    local namespace="$2"
    if kubectl get "$resource" -n "$namespace" >/dev/null 2>&1; then
        if ! kubectl rollout status "$resource" -n "$namespace" --timeout="$ROLLOUT_TIMEOUT"; then
            echo "ERROR: ${resource} did not become ready in ${namespace}."
            kubectl get pods -n "$namespace" -o wide || true
            kubectl get pvc -n "$namespace" || true
            kubectl get events -n "$namespace" --sort-by=.lastTimestamp | tail -n 30 || true
            return 1
        fi
    else
        echo "Resource $resource not found in $namespace. Skipping rollout wait."
    fi
}

show_job_logs() {
    local job_name="$1"
    local namespace="$2"
    local pod
    local found=false

    while IFS= read -r pod; do
        [[ -z "$pod" ]] && continue
        found=true
        echo "Logs for ${namespace}/${pod}:"
        kubectl logs "$pod" -n "$namespace" --all-containers=true --prefix=true || true
    done < <(
        kubectl get pods -n "$namespace" -l "job-name=${job_name}" -o name 2>/dev/null || true
    )

    if [[ "$found" != "true" ]]; then
        echo "No pods remain for Job ${namespace}/${job_name}."
    fi
}

show_job_diagnostics() {
    local job_name="$1"
    local namespace="$2"

    show_job_logs "$job_name" "$namespace"
    kubectl describe job "$job_name" -n "$namespace" || true
    kubectl get pods -n "$namespace" -l "job-name=${job_name}" -o wide || true
    kubectl get events -n "$namespace" --sort-by=.lastTimestamp | tail -n 40 || true
}

wait_for_job_completion() {
    local job_name="$1"
    local namespace="$2"
    local timeout_seconds="$3"
    local deadline=$((SECONDS + timeout_seconds))
    local succeeded
    local failed_condition

    while (( SECONDS < deadline )); do
        if ! kubectl get job "$job_name" -n "$namespace" >/dev/null 2>&1; then
            echo "ERROR: Job ${namespace}/${job_name} disappeared while waiting for completion."
            return 1
        fi

        succeeded="$(kubectl get job "$job_name" -n "$namespace" -o jsonpath='{.status.succeeded}' 2>/dev/null || true)"
        if [[ "${succeeded:-0}" =~ ^[1-9][0-9]*$ ]]; then
            return 0
        fi

        failed_condition="$(
            kubectl get job "$job_name" -n "$namespace" \
                -o jsonpath='{range .status.conditions[?(@.type=="Failed")]}{.status}{"|"}{.reason}{"|"}{.message}{end}' \
                2>/dev/null || true
        )"
        if [[ "${failed_condition%%|*}" == "True" ]]; then
            echo "ERROR: Job ${namespace}/${job_name} failed: ${failed_condition}"
            return 1
        fi

        sleep 3
    done

    echo "ERROR: Timed out after ${timeout_seconds}s waiting for Job ${namespace}/${job_name}."
    return 1
}

append_default() {
    local file="$1"
    local key="$2"
    local value="$3"
    if ! grep -q "^${key}=" "$file"; then
        echo "${key}=${value}" >> "$file"
    fi
}

set_key() {
    local file="$1"
    local key="$2"
    local value="$3"
    local tmp_file="${file}.tmp"

    grep -v "^${key}=" "$file" > "$tmp_file" || true
    mv "$tmp_file" "$file"
    echo "${key}=${value}" >> "$file"
}

get_env_value() {
    local file="$1"
    local key="$2"
    grep "^${key}=" "$file" | tail -n 1 | cut -d '=' -f 2- || true
}

copy_key_if_missing() {
    local file="$1"
    local target="$2"
    local source="$3"
    local value

    if grep -q "^${target}=" "$file"; then
        return
    fi

    value="$(get_env_value "$file" "$source")"
    if [[ -n "$value" ]]; then
        echo "${target}=${value}" >> "$file"
    fi
}

require_keys() {
    local file="$1"
    shift
    local missing=""

    for required_key in "$@"; do
        if ! grep -q "^${required_key}=" "$file"; then
            missing="${missing} ${required_key}"
        fi
    done

    if [[ -n "$missing" ]]; then
        echo "ERROR: Missing required secrets:${missing}"
        echo "Set these in .env before deploying."
        exit 1
    fi
}

inject_configs() {
    echo "Injecting generated ConfigMaps and Secrets..."

    kubectl apply -f ./k8s/00-namespace.yaml >/dev/null

    local default_limit_cpu="250m"
    local default_limit_memory="512Mi"
    local default_request_cpu="250m"
    local default_request_memory="512Mi"

    if [[ "$PROFILE" == "local" ]]; then
        default_limit_cpu="500m"
        default_limit_memory="1Gi"
        default_request_cpu="50m"
        default_request_memory="128Mi"
    fi

    for ns in "${NAMESPACES[@]}"; do
        cat <<EOF | kubectl apply -n "$ns" -f -
apiVersion: v1
kind: LimitRange
metadata:
  name: autopilot-shrink-ray
spec:
  limits:
  - default:
      cpu: "${default_limit_cpu}"
      memory: "${default_limit_memory}"
    defaultRequest:
      cpu: "${default_request_cpu}"
      memory: "${default_request_memory}"
    type: Container
EOF
    done

    for ns in plv-main-campus plv-annex-campus plv-pubad-campus; do
        kubectl create configmap fabric-common-config \
            --from-file=core.yaml=./config/core.yaml \
            --from-file=orderer.yaml=./config/orderer.yaml \
            -n "$ns" --dry-run=client -o yaml | kubectl apply -f -
    done

    if [[ ! -f "./init-db-schema.sql" ]]; then
        echo "ERROR: ./init-db-schema.sql not found."
        exit 1
    fi

    if ! compgen -G "../migrations/[0-9][0-9][0-9]_*.sql" >/dev/null; then
        echo "ERROR: No numbered PostgreSQL migrations were found in ../migrations."
        exit 1
    fi

    for ns in plv-main-campus plv-annex-campus plv-pubad-campus; do
        kubectl create configmap postgres-init-script \
            --from-file=00-base-schema.sql=./init-db-schema.sql \
            -n "$ns" --dry-run=client -o yaml | kubectl apply -f -
    done

    local migration_config_args=()
    local migration_file
    for migration_file in ../migrations/[0-9][0-9][0-9]_*.sql; do
        migration_config_args+=("--from-file=$(basename "$migration_file")=$migration_file")
    done
    kubectl create configmap postgres-runtime-migrations \
        "${migration_config_args[@]}" \
        -n plv-main-campus --dry-run=client -o yaml | kubectl apply -f -

    if [[ ! -f "./swarm.key" ]]; then
        echo "Generating missing IPFS swarm.key for this environment."
        printf "/key/swarm/psk/1.0.0/\n/base16/\n1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a\n" > ./swarm.key
    fi

    tr -d '\r' < ./swarm.key > ./swarm-clean.key
    for ns in plv-fabric plv-annex-campus plv-pubad-campus; do
        kubectl create configmap ipfs-swarm-key \
            --from-file=swarm.key=./swarm-clean.key \
            -n "$ns" --dry-run=client -o yaml | kubectl apply -f -
    done
    rm -f ./swarm-clean.key

    local env_file="./.env"
    local clean_env="./.clean.env"
    rm -f "$clean_env"
    touch "$clean_env"

    if [[ -f "$env_file" ]]; then
        tr -d '\r' < "$env_file" | grep -v '^#' | grep '=' | sort -u -t '=' -k 1,1 > "$clean_env"
    fi

    copy_key_if_missing "$clean_env" BOOTSTRAP_REGISTRAR_PASS BOOTSTRAP_REGISTRAR_PASSWORD
    copy_key_if_missing "$clean_env" BOOTSTRAP_REGISTRAR_PASSWORD BOOTSTRAP_REGISTRAR_PASS
    copy_key_if_missing "$clean_env" BOOTSTRAP_SYSTEM_ADMIN_PASS BOOTSTRAP_SYSTEM_ADMIN_PASSWORD
    copy_key_if_missing "$clean_env" BOOTSTRAP_SYSTEM_ADMIN_PASSWORD BOOTSTRAP_SYSTEM_ADMIN_PASS
    copy_key_if_missing "$clean_env" FABRIC_CA_REGISTRAR_PASS BOOTSTRAP_REGISTRAR_PASS
    copy_key_if_missing "$clean_env" FABRIC_CA_FACULTY_PASS BOOTSTRAP_REGISTRAR_PASS
    copy_key_if_missing "$clean_env" FABRIC_CA_DEPARTMENT_PASS BOOTSTRAP_REGISTRAR_PASS

    if [[ "$PROFILE" == "local" ]]; then
        copy_key_if_missing "$clean_env" VAULT_PASSWORD BOOTSTRAP_REGISTRAR_PASS
    fi

    require_keys "$clean_env" IPFS_ENCRYPTION_KEY JWT_SECRET INTERNAL_API_KEY BOOTSTRAP_REGISTRAR_PASS BOOTSTRAP_SYSTEM_ADMIN_PASS VAULT_PASSWORD
    require_keys "$clean_env" FABRIC_CA_REGISTRAR_PASS FABRIC_CA_FACULTY_PASS FABRIC_CA_DEPARTMENT_PASS

    if [[ "$PROFILE" == "production" ]]; then
        require_keys "$clean_env" POSTGRES_PASS POSTGRES_REPL_PASS COUCHDB_PASS
    fi

    append_default "$clean_env" POSTGRES_USER "postgres"
    append_default "$clean_env" POSTGRES_PASS "password"
    append_default "$clean_env" POSTGRES_DB "ActivityLogs"
    append_default "$clean_env" POSTGRES_REPL_USER "replica"
    append_default "$clean_env" POSTGRES_REPL_PASS "replica_pass_123"
    append_default "$clean_env" COUCHDB_USER "capstone"
    append_default "$clean_env" COUCHDB_PASS "pass123"

    local package_ids
    local package_key
    local package_value
    package_ids="$(bash ./k8s/install-chaincode.sh --print-package-ids)" || {
        echo "ERROR: Failed to calculate deterministic chaincode package IDs."
        exit 1
    }
    while IFS='=' read -r package_key package_value; do
        case "$package_key" in
            CHAINCODE_ID_REGISTRAR|CHAINCODE_ID_FACULTY|CHAINCODE_ID_DEPARTMENT)
                set_key "$clean_env" "$package_key" "$package_value"
                ;;
        esac
    done <<< "$package_ids"

    set_key "$clean_env" MIDDLEWARE_URL "http://middleware-api.plv-fabric.svc.cluster.local:4000"
    set_key "$clean_env" POSTGRES_HOST "postgres.plv-main-campus.svc.cluster.local"

    local couch_user
    local couch_pass
    couch_user="$(get_env_value "$clean_env" COUCHDB_USER)"
    couch_pass="$(get_env_value "$clean_env" COUCHDB_PASS)"

    set_key "$clean_env" COUCHDB_URL "http://${couch_user}:${couch_pass}@couchdb-registrar.plv-main-campus.svc.cluster.local:5984"
    set_key "$clean_env" COUCHDB_WALLET_URL "http://${couch_user}:${couch_pass}@couchdb-wallet-registrar.plv-main-campus.svc.cluster.local:5985"
    set_key "$clean_env" COUCHD_WALLET_MAIN_URL "http://${couch_user}:${couch_pass}@couchdb-wallet-registrar.plv-main-campus.svc.cluster.local:5985"
    set_key "$clean_env" COUCHDB_WALLET_REGISTRAR_URL "http://${couch_user}:${couch_pass}@couchdb-wallet-registrar.plv-main-campus.svc.cluster.local:5985"
    set_key "$clean_env" COUCHDB_WALLET_FACULTY_URL "http://${couch_user}:${couch_pass}@couchdb-wallet-faculty.plv-annex-campus.svc.cluster.local:5985"
    set_key "$clean_env" COUCHDB_WALLET_DEPARTMENT_URL "http://${couch_user}:${couch_pass}@couchdb-wallet-department.plv-pubad-campus.svc.cluster.local:5985"

    set_key "$clean_env" FABRIC_CA_REGISTRAR_URL "https://ca-registrar.plv-main-campus.svc.cluster.local:7054"
    set_key "$clean_env" FABRIC_CA_FACULTY_URL "https://ca-faculty.plv-annex-campus.svc.cluster.local:7054"
    set_key "$clean_env" FABRIC_CA_DEPARTMENT_URL "https://ca-department.plv-pubad-campus.svc.cluster.local:7054"

    for ns in "${NAMESPACES[@]}"; do
        kubectl create secret generic blockgo-secrets \
            -n "$ns" --from-env-file="$clean_env" \
            --dry-run=client -o yaml | kubectl apply -f -
    done

    rm -f "$clean_env"
    echo "Generated ConfigMaps and Secrets are ready."
}

prepare_manifests() {
    rm -rf "$TMP_K8S_DIR"
    mkdir -p "$TMP_K8S_DIR"
    cp ./k8s/*.yaml "$TMP_K8S_DIR/"

    if [[ "$PROFILE" == "local" ]]; then
        echo "Preparing local manifests with immutable source image tag ${LOCAL_IMAGE_TAG} and smaller storage."
        cp ./k8s/01b-persistent-volumes.local-kind.yaml.example "$TMP_K8S_DIR/01b-persistent-volumes.local-kind.yaml"
        local pv_root
        pv_root="$(local_pv_root)"
        echo "Local PV hostPath root: $pv_root"
        sed -i "s|\${PWD}|$pv_root|g" "$TMP_K8S_DIR/01b-persistent-volumes.local-kind.yaml"
        sed -i "s|registry.example.com/plv-repo/||g" "$TMP_K8S_DIR"/*.yaml
        local image_name
        for image_name in \
            fabric-middleware \
            client-app \
            frontend \
            registrar-chaincode \
            faculty-chaincode \
            department-chaincode; do
            sed -i "s|${image_name}:latest|${image_name}:${LOCAL_IMAGE_TAG}|g" "$TMP_K8S_DIR"/*.yaml
        done
        sed -i 's/imagePullPolicy: Always/imagePullPolicy: Never/g' "$TMP_K8S_DIR"/*.yaml
        sed -i 's/value: file/value: none/g' "$TMP_K8S_DIR"/06-orderer*.yaml
        sed -i '/- name: ORDERER_ADMIN_TLS_ENABLED/{n;s/value: "true"/value: "false"/;}' "$TMP_K8S_DIR"/06-orderer*.yaml
        sed -i 's/storage: 100Gi/storage: 10Gi/g' "$TMP_K8S_DIR"/*.yaml
        sed -i 's/storage: 50Gi/storage: 10Gi/g' "$TMP_K8S_DIR"/*.yaml
        sed -i 's/storage: 30Gi/storage: 10Gi/g' "$TMP_K8S_DIR"/*.yaml
        sed -i 's/storage: 20Gi/storage: 10Gi/g' "$TMP_K8S_DIR"/*.yaml
        sed -i 's/replicas: [23]/replicas: 1/g' "$TMP_K8S_DIR/08-middleware-api.yaml"
        sed -i 's/FABRIC_CA_INSECURE_TLS: "false"/FABRIC_CA_INSECURE_TLS: "true"/' "$TMP_K8S_DIR/08-middleware-api.yaml"
        sed -i '/- name: IPFS_RUN_AS_ROOT/{n;s/value: "false"/value: "true"/;}' "$TMP_K8S_DIR/09-ipfs.yaml"
    else
        echo "Preparing production manifests with the source-built image revision ${PRODUCTION_IMAGE_TAG}."
        local image_name
        for image_name in \
            fabric-middleware \
            client-app \
            frontend \
            registrar-chaincode \
            faculty-chaincode \
            department-chaincode; do
            sed -i \
                "s|registry.example.com/plv-repo/${image_name}:latest|${PRODUCTION_IMAGE_REPOSITORY%/}/${image_name}:${PRODUCTION_IMAGE_TAG}|g" \
                "$TMP_K8S_DIR"/*.yaml
        done

        if grep -R -q 'registry.example.com/plv-repo/' "$TMP_K8S_DIR"; then
            echo "ERROR: Placeholder production image references remain after manifest preparation."
            return 1
        fi
    fi
}

prepare_local_middleware_image() {
    if [[ "$PROFILE" != "local" ]]; then
        return
    fi

    echo "Building the local middleware microservices image (Docker cache enabled)..."
    docker build \
        -t "fabric-middleware:${LOCAL_IMAGE_TAG}" \
        -t fabric-middleware:latest \
        -f ../middleware/Dockerfile \
        ../middleware

    echo "Validating middleware microservice entrypoints..."
    docker run --rm --entrypoint node "fabric-middleware:${LOCAL_IMAGE_TAG}" -e '
        const scripts = require("/app/package.json").scripts || {};
        const required = ["start:gateway", "start:auth", "start:identity", "start:ledger", "start:upload", "start:settings"];
        const missing = required.filter((name) => !scripts[name]);
        if (missing.length > 0) {
            console.error(`Missing middleware scripts: ${missing.join(", ")}`);
            process.exit(1);
        }
        console.log("All middleware microservice entrypoints are present.");
    '
}

verify_required_application_fixes() {
    echo "Verifying required application fixes are present in the deployment source..."

    grep -q 'if (g >= 84) return "2.00"' ../frontend/src/utils/gradingHelpers.js || {
        echo "ERROR: The college grade-equivalent scale is missing from the frontend source."
        return 1
    }
    grep -q '>Grade</th><th className="px-4 py-3">Equivalent</th>' ../frontend/src/components/student/StudentHistoricalGrades.jsx || {
        echo "ERROR: The distinct Grade and Equivalent columns are missing from the student grade view."
        return 1
    }
    grep -q 'displayTransactionDate' ../frontend/src/components/student/StudentBlockchainTransactions.jsx || {
        echo "ERROR: The defensive transaction-date formatter is missing from the frontend source."
        return 1
    }
    grep -q 'NormalizeTransactionTimestamp' ../client-app/Controllers/StudentController.cs || {
        echo "ERROR: Fabric timestamp normalization is missing from the client-app source."
        return 1
    }
    grep -q 'if (rawAverage >= 84) return 2.00' ../client-app/Controllers/GradeController.cs || {
        echo "ERROR: The college grade-equivalent scale is missing from the client-app source."
        return 1
    }
    grep -q 'time.Unix(entry.Timestamp.Seconds' ../chaincode/main.go || {
        echo "ERROR: ISO transaction timestamps are missing from the chaincode source."
        return 1
    }
    grep -q 'ResetPasswordAsync(int userId' ../client-app/Services/IAccountProvisioningService.cs || {
        echo "ERROR: Role-limited manual password reset is missing from the client-app source."
        return 1
    }
    grep -q '"registrar" => target.Role is "student" or "faculty" or "department_admin"' ../client-app/Services/AccountProvisioningService.cs || {
        echo "ERROR: The Registrar password-reset role boundary is missing."
        return 1
    }
    grep -q '"system_admin" => target.Role == "registrar"' ../client-app/Services/AccountProvisioningService.cs || {
        echo "ERROR: The System Administrator password-reset role boundary is missing."
        return 1
    }
    grep -q 'HttpPost("registrar-correct/{recordId}")' ../client-app/Controllers/GradeController.cs || {
        echo "ERROR: The Registrar finalized-grade correction endpoint is missing."
        return 1
    }
    grep -q 'Commit Corrected Grade' ../frontend/src/components/registrar/RegistrarGradesView.jsx || {
        echo "ERROR: The Registrar grade-correction frontend control is missing."
        return 1
    }
    grep -q 'Password Management' ../frontend/src/components/registrar/RegistrarGradesView.jsx || {
        echo "ERROR: The Registrar password-management frontend control is missing."
        return 1
    }

    grep -q 'const ActionReason' ../frontend/src/components/registrar/SystemLogs.jsx || {
        echo "ERROR: Human-readable Registrar activity-log rendering is missing."
        return 1
    }
    grep -q 'backToConversationList' ../frontend/src/components/shared/Chat.jsx || {
        echo "ERROR: The chat Back navigation control is missing."
        return 1
    }
    grep -q 'Permanently delete every message' ../frontend/src/components/shared/Chat.jsx || {
        echo "ERROR: Permanent direct-message deletion is missing from the chat frontend."
        return 1
    }
    grep -q 'Group invitations' ../frontend/src/components/shared/Chat.jsx || {
        echo "ERROR: Group invitation controls are missing from the chat frontend."
        return 1
    }
    grep -q 'CreateGroupChat' ../client-app/Controllers/ChatHub.cs || {
        echo "ERROR: Group-chat creation is missing from the chat hub."
        return 1
    }
    grep -q 'RespondToGroupInvitation' ../client-app/Controllers/ChatHub.cs || {
        echo "ERROR: Group invitation acceptance and decline are missing from the chat hub."
        return 1
    }
    grep -q 'TimeSpan.FromDays(30)' ../client-app/Controllers/ChatHub.cs || {
        echo "ERROR: The required 30-day chat history window is missing."
        return 1
    }
    grep -q 'DeleteHistoryAsync' ../client-app/Services/ChatCache.cs || {
        echo "ERROR: Permanent chat-cache deletion is missing."
        return 1
    }
    grep -q 'chat_conversation_states' ../migrations/006_chat_conversation_states.sql || {
        echo "ERROR: Migration 006 for chat conversation state is missing or invalid."
        return 1
    }
    grep -q 'chat_group_messages' ../migrations/007_group_chats.sql || {
        echo "ERROR: Migration 007 for group chats is missing or invalid."
        return 1
    }

    echo "Required grade, timestamp, password-reset, Registrar, and chat fixes are present."
}

prepare_local_application_images() {
    if [[ "$PROFILE" != "local" ]]; then
        return
    fi

    echo "Building the local client-app image from the current source..."
    docker build \
        -t "client-app:${LOCAL_IMAGE_TAG}" \
        -t client-app:latest \
        -f ../client-app/Dockerfile \
        ../client-app

    echo "Building the local frontend image from the current source..."
    docker build \
        -t "frontend:${LOCAL_IMAGE_TAG}" \
        -t frontend:latest \
        -f ../frontend/Dockerfile \
        ../frontend
}

validate_production_image_settings() {
    if [[ "$PROFILE" != "production" ]]; then
        return
    fi

    if [[ -z "$PRODUCTION_IMAGE_REPOSITORY" || "$PRODUCTION_IMAGE_REPOSITORY" == "registry.example.com/plv-repo" ]]; then
        echo "ERROR: Set PRODUCTION_IMAGE_REPOSITORY to the writable container repository used by the cluster."
        return 1
    fi
    if [[ -z "$PRODUCTION_IMAGE_TAG" || "$PRODUCTION_IMAGE_TAG" == "latest" ]]; then
        echo "ERROR: Set PRODUCTION_IMAGE_TAG to an immutable revision such as a release number or commit SHA; 'latest' is refused."
        return 1
    fi
    if [[ ! "$PRODUCTION_IMAGE_REPOSITORY" =~ ^[A-Za-z0-9._:/-]+$ ]]; then
        echo "ERROR: PRODUCTION_IMAGE_REPOSITORY contains unsupported characters."
        return 1
    fi
    if [[ ! "$PRODUCTION_IMAGE_TAG" =~ ^[A-Za-z0-9._-]+$ ]]; then
        echo "ERROR: PRODUCTION_IMAGE_TAG contains unsupported characters."
        return 1
    fi
}

prepare_production_source_images() {
    if [[ "$PROFILE" != "production" ]]; then
        return
    fi

    validate_production_image_settings
    if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
        echo "ERROR: Docker is required to build and publish production images."
        return 1
    fi

    local repository="${PRODUCTION_IMAGE_REPOSITORY%/}"
    local tag="$PRODUCTION_IMAGE_TAG"
    echo "Building production application images from the current workspace at ${repository}/*:${tag}..."

    docker build -t "${repository}/fabric-middleware:${tag}" -f ../middleware/Dockerfile ../middleware
    docker build -t "${repository}/client-app:${tag}" -f ../client-app/Dockerfile ../client-app
    docker build -t "${repository}/frontend:${tag}" -f ../frontend/Dockerfile ../frontend
    docker build -t "${repository}/registrar-chaincode:${tag}" -f ../chaincode/Dockerfile ../chaincode
    docker image tag "${repository}/registrar-chaincode:${tag}" "${repository}/faculty-chaincode:${tag}"
    docker image tag "${repository}/registrar-chaincode:${tag}" "${repository}/department-chaincode:${tag}"

    local image_name
    for image_name in \
        fabric-middleware \
        client-app \
        frontend \
        registrar-chaincode \
        faculty-chaincode \
        department-chaincode; do
        echo "Publishing ${repository}/${image_name}:${tag}..."
        docker push "${repository}/${image_name}:${tag}"
    done
}

verify_deployment_inputs() {
    verify_required_application_fixes
    validate_production_image_settings
    prepare_manifests

    local image_repository=""
    local image_tag="$LOCAL_IMAGE_TAG"
    if [[ "$PROFILE" == "production" ]]; then
        image_repository="${PRODUCTION_IMAGE_REPOSITORY%/}/"
        image_tag="$PRODUCTION_IMAGE_TAG"
    fi

    local image_name
    local expected_image
    for image_name in \
        fabric-middleware \
        client-app \
        frontend \
        registrar-chaincode \
        faculty-chaincode \
        department-chaincode; do
        expected_image="${image_repository}${image_name}:${image_tag}"
        if ! grep -R -F -q "image: ${expected_image}" "$TMP_K8S_DIR"; then
            echo "ERROR: Prepared manifests do not reference ${expected_image}."
            return 1
        fi
    done

    local required_file
    for required_file in \
        ../migrations/006_chat_conversation_states.sql \
        ../migrations/007_group_chats.sql \
        ../monitoring/grafana-dashboard.json \
        ../monitoring/grafana-kubernetes-memory.json \
        ../monitoring/grafana-api-observability.json \
        ../monitoring/grafana-fabric.json \
        ../monitoring/grafana-postgresql.json \
        ../monitoring/grafana-workflows.json \
        ../monitoring/grafana-logs.json \
        ../monitoring/observability-stack.yaml; do
        if [[ ! -s "$required_file" ]]; then
            echo "ERROR: Required deployment artifact ${required_file} is missing or empty."
            return 1
        fi
    done

    if ! grep -q 'postgres-runtime-migrations' ./k8s/04a-postgres-configmap.yaml; then
        echo "ERROR: The PostgreSQL migration Job is not wired to the generated migration ConfigMap."
        return 1
    fi

    echo "Deployment inputs verified for ${PROFILE}; no cluster resources were changed."
}

configure_local_application_rollouts() {
    if [[ "$PROFILE" != "local" ]]; then
        return
    fi

    echo "Configuring one-pod local application deployments without rollout surge..."
    local deployment
    local deployments=(
        middleware-api
        auth-service
        fabric-identity-service
        ledger-service
        grade-upload-service
        settings-service
        client-app
        frontend
        ipfs-ha-router
    )

    for deployment in "${deployments[@]}"; do
        kubectl patch deployment "$deployment" -n plv-fabric --type=merge \
            -p '{"spec":{"strategy":{"type":"Recreate","rollingUpdate":null}}}' >/dev/null
    done

    kubectl patch deployment registrar-chaincode -n plv-main-campus --type=merge \
        -p '{"spec":{"strategy":{"type":"Recreate","rollingUpdate":null}}}' >/dev/null
    kubectl patch deployment faculty-chaincode -n plv-annex-campus --type=merge \
        -p '{"spec":{"strategy":{"type":"Recreate","rollingUpdate":null}}}' >/dev/null
    kubectl patch deployment department-chaincode -n plv-pubad-campus --type=merge \
        -p '{"spec":{"strategy":{"type":"Recreate","rollingUpdate":null}}}' >/dev/null
}

restart_deployment_and_wait() {
    local deployment="$1"
    local namespace="$2"

    echo "Restarting ${namespace}/deployment/${deployment}..."
    kubectl rollout restart "deployment/${deployment}" -n "$namespace" >/dev/null
    wait_rollout "deployment/${deployment}" "$namespace"
}

deploy_orderer() {
    local manifest="$1"
    local deployment="$2"
    local namespace="$3"

    apply_manifest "$manifest"
    restart_deployment_and_wait "$deployment" "$namespace"
}

deploy_orderers_sequentially() {
    local orderers=(
        "$TMP_K8S_DIR/06-orderer-1.yaml|orderer-1|plv-main-campus"
        "$TMP_K8S_DIR/06-orderer-2.yaml|orderer-2|plv-main-campus"
        "$TMP_K8S_DIR/06-orderer-3.yaml|orderer-3|plv-annex-campus"
    )
    local -A deployed=()
    local entry
    local manifest
    local deployment
    local namespace
    local desired
    local current
    local scheduled

    echo "Recovering interrupted orderer rollouts before normal sequential updates..."
    for entry in "${orderers[@]}"; do
        IFS='|' read -r manifest deployment namespace <<< "$entry"
        if ! kubectl get deployment "$deployment" -n "$namespace" >/dev/null 2>&1; then
            continue
        fi

        desired="$(kubectl get deployment "$deployment" -n "$namespace" -o jsonpath='{.spec.replicas}')"
        current="$(kubectl get deployment "$deployment" -n "$namespace" -o jsonpath='{.status.replicas}')"
        scheduled="$(
            kubectl get pods -n "$namespace" -l "app=${deployment}" \
                -o jsonpath='{range .items[*]}{.spec.nodeName}{"\n"}{end}' |
                awk 'NF { count++ } END { print count + 0 }'
        )"
        desired="${desired:-0}"
        current="${current:-0}"
        scheduled="${scheduled:-0}"

        if (( scheduled > desired )); then
            echo "${namespace}/deployment/${deployment} has ${scheduled} scheduled pods (${current} replica objects) for desired ${desired}; reconciling it first."
            deploy_orderer "$manifest" "$deployment" "$namespace"
            deployed["$deployment"]=true
        fi
    done

    echo "Deploying remaining orderers sequentially..."
    for entry in "${orderers[@]}"; do
        IFS='|' read -r manifest deployment namespace <<< "$entry"
        if [[ "${deployed[$deployment]:-}" == "true" ]]; then
            continue
        fi
        deploy_orderer "$manifest" "$deployment" "$namespace"
    done
}

configure_orderer_channel_endpoint_aliases() {
    local orderer_one_ip
    local orderer_two_ip
    local orderer_three_ip
    local patch
    local entry
    local deployment
    local namespace

    orderer_one_ip="$(kubectl get service orderer-1 -n plv-main-campus -o jsonpath='{.spec.clusterIP}')"
    orderer_two_ip="$(kubectl get service orderer-2 -n plv-main-campus -o jsonpath='{.spec.clusterIP}')"
    orderer_three_ip="$(kubectl get service orderer-3 -n plv-annex-campus -o jsonpath='{.spec.clusterIP}')"

    if [[ -z "$orderer_one_ip" || -z "$orderer_two_ip" || -z "$orderer_three_ip" ]]; then
        echo "ERROR: Could not resolve all orderer Service IPs for channel endpoint aliases."
        return 1
    fi

    patch="{\"spec\":{\"template\":{\"spec\":{\"hostAliases\":[{\"ip\":\"${orderer_one_ip}\",\"hostnames\":[\"orderer.capstone.com\"]},{\"ip\":\"${orderer_two_ip}\",\"hostnames\":[\"orderer2.capstone.com\"]},{\"ip\":\"${orderer_three_ip}\",\"hostnames\":[\"orderer3.capstone.com\"]}]}}}}"

    echo "Configuring Kubernetes resolution for the orderer endpoints embedded in existing channel artifacts..."
    for entry in \
        "orderer-1|plv-main-campus" \
        "orderer-2|plv-main-campus" \
        "orderer-3|plv-annex-campus"; do
        IFS='|' read -r deployment namespace <<< "$entry"
        kubectl patch deployment "$deployment" -n "$namespace" --type=merge -p "$patch" >/dev/null
        wait_rollout "deployment/${deployment}" "$namespace"
    done
}

configure_peer_channel_endpoint_aliases() {
    local orderer_one_ip
    local orderer_two_ip
    local orderer_three_ip
    local registrar_peer_ip
    local faculty_peer_ip
    local department_peer_ip
    local patch
    local entry
    local deployment
    local namespace

    orderer_one_ip="$(kubectl get service orderer-1 -n plv-main-campus -o jsonpath='{.spec.clusterIP}')"
    orderer_two_ip="$(kubectl get service orderer-2 -n plv-main-campus -o jsonpath='{.spec.clusterIP}')"
    orderer_three_ip="$(kubectl get service orderer-3 -n plv-annex-campus -o jsonpath='{.spec.clusterIP}')"
    registrar_peer_ip="$(kubectl get service peer-registrar -n plv-main-campus -o jsonpath='{.spec.clusterIP}')"
    faculty_peer_ip="$(kubectl get service peer-faculty -n plv-annex-campus -o jsonpath='{.spec.clusterIP}')"
    department_peer_ip="$(kubectl get service peer-department -n plv-pubad-campus -o jsonpath='{.spec.clusterIP}')"

    if [[ -z "$orderer_one_ip" || -z "$orderer_two_ip" || -z "$orderer_three_ip" || \
          -z "$registrar_peer_ip" || -z "$faculty_peer_ip" || -z "$department_peer_ip" ]]; then
        echo "ERROR: Could not resolve all Fabric Service IPs for peer channel endpoint aliases."
        return 1
    fi

    patch="{\"spec\":{\"template\":{\"spec\":{\"hostAliases\":[{\"ip\":\"${orderer_one_ip}\",\"hostnames\":[\"orderer.capstone.com\"]},{\"ip\":\"${orderer_two_ip}\",\"hostnames\":[\"orderer2.capstone.com\"]},{\"ip\":\"${orderer_three_ip}\",\"hostnames\":[\"orderer3.capstone.com\"]},{\"ip\":\"${registrar_peer_ip}\",\"hostnames\":[\"peer0.registrar.capstone.com\"]},{\"ip\":\"${faculty_peer_ip}\",\"hostnames\":[\"peer0.faculty.capstone.com\"]},{\"ip\":\"${department_peer_ip}\",\"hostnames\":[\"peer0.department.capstone.com\"]}]}}}}"

    echo "Configuring Kubernetes resolution for the channel endpoints used by Fabric peers..."
    for entry in \
        "peer-registrar|plv-main-campus" \
        "peer-faculty|plv-annex-campus" \
        "peer-department|plv-pubad-campus"; do
        IFS='|' read -r deployment namespace <<< "$entry"
        kubectl patch deployment "$deployment" -n "$namespace" --type=merge -p "$patch" >/dev/null
        wait_rollout "deployment/${deployment}" "$namespace"
    done
}

    prepare_local_chaincode_images() {
        if [[ "$PROFILE" != "local" ]]; then
            return
        fi

        echo "Building the local chaincode image from the current source..."
        docker build \
            -t "registrar-chaincode:${LOCAL_IMAGE_TAG}" \
            -t registrar-chaincode:latest \
            -f ../chaincode/Dockerfile \
            ../chaincode
        docker image tag "registrar-chaincode:${LOCAL_IMAGE_TAG}" "faculty-chaincode:${LOCAL_IMAGE_TAG}"
        docker image tag "registrar-chaincode:${LOCAL_IMAGE_TAG}" "department-chaincode:${LOCAL_IMAGE_TAG}"
        docker image tag "registrar-chaincode:${LOCAL_IMAGE_TAG}" faculty-chaincode:latest
        docker image tag "registrar-chaincode:${LOCAL_IMAGE_TAG}" department-chaincode:latest
    }

    deploy_manifests() {
    echo "Deploying K8s manifests..."
    verify_required_application_fixes
    prepare_local_middleware_image
    prepare_local_application_images
    prepare_local_chaincode_images
    prepare_production_source_images
    prepare_manifests

    apply_manifest "$TMP_K8S_DIR/00-namespace.yaml"
    apply_manifest "$TMP_K8S_DIR/01a-storage-class.yaml"
    if [[ "$PROFILE" == "local" ]]; then
        apply_manifest "$TMP_K8S_DIR/01b-persistent-volumes.local-kind.yaml"
        repair_lost_local_pvcs
    fi
    apply_manifest "$TMP_K8S_DIR/02-configmap-secret.yaml"
    apply_manifest "$TMP_K8S_DIR/03-Abac.yaml"
    apply_manifest "$TMP_K8S_DIR/04a-postgres-primary.yaml"

    echo "Waiting for PostgreSQL before applying schema migrations..."
    wait_rollout statefulset/postgres-primary plv-main-campus
    kubectl delete job postgres-schema-migrations -n plv-main-campus --ignore-not-found --wait=true >/dev/null
    apply_manifest "$TMP_K8S_DIR/04a-postgres-configmap.yaml"
    if ! wait_for_job_completion postgres-schema-migrations plv-main-campus 660; then
        echo "ERROR: PostgreSQL schema migrations failed."
        show_job_diagnostics postgres-schema-migrations plv-main-campus
        return 1
    fi
    show_job_logs postgres-schema-migrations plv-main-campus

    if [[ "$PROFILE" == "production" ]]; then
        apply_manifest "$TMP_K8S_DIR/04b-postgres-replica-annex.yaml"
        apply_manifest "$TMP_K8S_DIR/04c-postgres-replica-pubad.yaml"
    fi

    apply_manifest "$TMP_K8S_DIR/05-fabric-ca.yaml"
    deploy_orderers_sequentially
    configure_orderer_channel_endpoint_aliases
    apply_manifest "$TMP_K8S_DIR/07-peer-registrar.yaml"
    apply_manifest "$TMP_K8S_DIR/07-peer-faculty.yaml"
    apply_manifest "$TMP_K8S_DIR/07-peer-department.yaml"
    configure_peer_channel_endpoint_aliases
    apply_manifest "$TMP_K8S_DIR/08-middleware-api.yaml"
    apply_manifest "$TMP_K8S_DIR/09-ipfs.yaml"
    wait_rollout statefulset/ipfs-node plv-fabric
    wait_rollout statefulset/ipfs-annex plv-annex-campus
    wait_rollout statefulset/ipfs-pubad plv-pubad-campus
    wait_rollout deployment/ipfs-ha-router plv-fabric
    kubectl delete job ipfs-cluster-bootstrap -n plv-fabric --ignore-not-found --wait=true >/dev/null
    apply_manifest "$TMP_K8S_DIR/09b-ipfs-cluster-bootstrap.yaml"
    if ! wait_for_job_completion ipfs-cluster-bootstrap plv-fabric 420; then
        echo "ERROR: IPFS private cluster bootstrap or pin replication failed."
        show_job_diagnostics ipfs-cluster-bootstrap plv-fabric
        return 1
    fi
    show_job_logs ipfs-cluster-bootstrap plv-fabric
    kubectl delete job ipfs-webui-bootstrap -n plv-fabric --ignore-not-found --wait=true >/dev/null
    apply_manifest "$TMP_K8S_DIR/09a-ipfs-webui-bootstrap.yaml"
    if ! wait_for_job_completion ipfs-webui-bootstrap plv-fabric 420; then
        echo "ERROR: IPFS Web UI bootstrap failed."
        show_job_diagnostics ipfs-webui-bootstrap plv-fabric
        return 1
    fi
    show_job_logs ipfs-webui-bootstrap plv-fabric
    apply_manifest "$TMP_K8S_DIR/09c-ipfs-pin-reconciler.yaml"
    apply_manifest "$TMP_K8S_DIR/10-ingress-network-policy.yaml"
    apply_manifest "$TMP_K8S_DIR/12a-redis.yaml"
    apply_manifest "$TMP_K8S_DIR/14-client-app.yaml"
    apply_manifest "$TMP_K8S_DIR/12-frontend-ha.yaml"
    apply_manifest "$TMP_K8S_DIR/13-cli.yaml"
    apply_manifest "$TMP_K8S_DIR/17-chaincode.yaml"
    apply_manifest "$TMP_K8S_DIR/18-faculty-chaincode.yaml"
    apply_manifest "$TMP_K8S_DIR/19-department-chaincode.yaml"

    if [[ "$PROFILE" == "production" ]]; then
        apply_manifest "$TMP_K8S_DIR/11-monitoring-pdb-quotas.yaml"
        apply_manifest "$TMP_K8S_DIR/11a-application-hpa.yaml"
        apply_manifest "$TMP_K8S_DIR/15-main-ingress.yaml"
        apply_manifest "$TMP_K8S_DIR/15-couchdb-backup.yaml"
        apply_manifest "$TMP_K8S_DIR/16-firewall-config.yaml"
    else
        kubectl delete horizontalpodautoscaler \
            middleware-api-hpa auth-service-hpa ledger-service-hpa grade-upload-service-hpa client-app-hpa \
            -n plv-fabric --ignore-not-found
        echo "Skipping production-only autoscaling, ingress, backup, quota, and firewall manifests for local profile."
    fi

    deploy_observability
    configure_local_observability_resources

    configure_local_application_rollouts

    echo "Restarting Fabric peers sequentially to reload refreshed crypto Secrets..."
    restart_deployment_and_wait peer-registrar plv-main-campus
    restart_deployment_and_wait peer-faculty plv-annex-campus
    restart_deployment_and_wait peer-department plv-pubad-campus

    echo "Restarting chaincode deployments sequentially to load the images built from current source..."
    restart_deployment_and_wait registrar-chaincode plv-main-campus
    restart_deployment_and_wait faculty-chaincode plv-annex-campus
    restart_deployment_and_wait department-chaincode plv-pubad-campus

    echo "Restarting application deployments sequentially..."
    restart_deployment_and_wait auth-service plv-fabric
    restart_deployment_and_wait fabric-identity-service plv-fabric
    restart_deployment_and_wait ledger-service plv-fabric
    restart_deployment_and_wait grade-upload-service plv-fabric
    restart_deployment_and_wait settings-service plv-fabric
    restart_deployment_and_wait middleware-api plv-fabric
    restart_deployment_and_wait client-app plv-fabric
    restart_deployment_and_wait frontend plv-fabric

    echo "Fabric and application deployments restarted sequentially."
    echo "Manifests deployed."
}

wait_deployments() {
    echo "Waiting for deployments to be ready..."
    wait_rollout statefulset/postgres-primary plv-main-campus
    wait_rollout deployment/redis-master plv-fabric
    wait_rollout deployment/fabric-ca-registrar plv-main-campus
    wait_rollout deployment/fabric-ca-faculty plv-annex-campus
    wait_rollout deployment/fabric-ca-department plv-pubad-campus
    wait_rollout deployment/orderer-1 plv-main-campus
    wait_rollout deployment/orderer-2 plv-main-campus
    wait_rollout deployment/orderer-3 plv-annex-campus
    wait_rollout statefulset/couchdb-wallet-registrar plv-main-campus
    wait_rollout statefulset/couchdb-wallet-faculty plv-annex-campus
    wait_rollout statefulset/couchdb-wallet-department plv-pubad-campus
    wait_rollout deployment/peer-registrar plv-main-campus
    wait_rollout deployment/peer-faculty plv-annex-campus
    wait_rollout deployment/peer-department plv-pubad-campus
    wait_rollout statefulset/ipfs-node plv-fabric
    wait_rollout statefulset/ipfs-annex plv-annex-campus
    wait_rollout statefulset/ipfs-pubad plv-pubad-campus
    wait_rollout deployment/ipfs-ha-router plv-fabric
    wait_rollout deployment/auth-service plv-fabric
    wait_rollout deployment/fabric-identity-service plv-fabric
    wait_rollout deployment/ledger-service plv-fabric
    wait_rollout deployment/grade-upload-service plv-fabric
    wait_rollout deployment/settings-service plv-fabric
    wait_rollout deployment/middleware-api plv-fabric
    wait_rollout deployment/client-app plv-fabric
    wait_rollout deployment/frontend plv-fabric
    wait_rollout deployment/prometheus plv-fabric
    wait_rollout deployment/kube-state-metrics plv-fabric
    wait_rollout deployment/loki plv-fabric
    wait_rollout deployment/alloy plv-fabric
    wait_rollout deployment/grafana plv-fabric
    wait_rollout deployment/postgres-exporter plv-main-campus

    if [[ "$PROFILE" == "production" ]]; then
        wait_rollout statefulset/postgres-replica-annex plv-annex-campus
        wait_rollout statefulset/postgres-replica-pubad plv-pubad-campus
    fi

    echo "All requested rollouts are ready."
}

verify_deployed_application_revision() {
    echo "Verifying the deployed application revision and required chat migrations..."

    local migration_config
    migration_config="$(kubectl get configmap postgres-runtime-migrations -n plv-main-campus -o json)"
    grep -q '006_chat_conversation_states.sql' <<< "$migration_config" || {
        echo "ERROR: Migration 006 is absent from the deployed migration ConfigMap."
        return 1
    }
    grep -q '007_group_chats.sql' <<< "$migration_config" || {
        echo "ERROR: Migration 007 is absent from the deployed migration ConfigMap."
        return 1
    }

    local migration_logs
    migration_logs="$(kubectl logs job/postgres-schema-migrations -n plv-main-campus --all-containers=true)"
    grep -q 'Applying 006_chat_conversation_states.sql' <<< "$migration_logs" || {
        echo "ERROR: Migration 006 was not observed in the completed migration Job."
        return 1
    }
    grep -q 'Applying 007_group_chats.sql' <<< "$migration_logs" || {
        echo "ERROR: Migration 007 was not observed in the completed migration Job."
        return 1
    }

    local image_repository=""
    local image_tag=""
    if [[ "$PROFILE" == "local" ]]; then
        image_tag="$LOCAL_IMAGE_TAG"
    else
        image_repository="${PRODUCTION_IMAGE_REPOSITORY%/}/"
        image_tag="$PRODUCTION_IMAGE_TAG"
    fi

    local deployment_entry
    local deployment
    local namespace
    local image_name
    local expected_image
    local deployed_image
    for deployment_entry in \
        "middleware-api|plv-fabric|fabric-middleware" \
        "auth-service|plv-fabric|fabric-middleware" \
        "fabric-identity-service|plv-fabric|fabric-middleware" \
        "ledger-service|plv-fabric|fabric-middleware" \
        "grade-upload-service|plv-fabric|fabric-middleware" \
        "settings-service|plv-fabric|fabric-middleware" \
        "client-app|plv-fabric|client-app" \
        "frontend|plv-fabric|frontend" \
        "registrar-chaincode|plv-main-campus|registrar-chaincode" \
        "faculty-chaincode|plv-annex-campus|faculty-chaincode" \
        "department-chaincode|plv-pubad-campus|department-chaincode"; do
        IFS='|' read -r deployment namespace image_name <<< "$deployment_entry"
        expected_image="${image_repository}${image_name}:${image_tag}"
        deployed_image="$(kubectl get deployment "$deployment" -n "$namespace" -o jsonpath='{.spec.template.spec.containers[0].image}')"
        if [[ "$deployed_image" != "$expected_image" ]]; then
            echo "ERROR: ${namespace}/${deployment} uses ${deployed_image}, expected ${expected_image}."
            return 1
        fi
    done

    local frontend_pod
    frontend_pod="$(kubectl get pods -n plv-fabric -l app=frontend -o jsonpath='{.items[0].metadata.name}')"
    if [[ -z "$frontend_pod" ]]; then
        echo "ERROR: No frontend pod is available for deployed-bundle verification."
        return 1
    fi
    kubectl exec "$frontend_pod" -n plv-fabric -- sh -ec \
        "grep -R -q 'Group invitations' /usr/share/nginx/html/static/js && grep -R -q 'Permanently delete every message' /usr/share/nginx/html/static/js" || {
        echo "ERROR: The deployed frontend bundle does not contain the required chat features."
        return 1
    }

    echo "All custom deployments, the frontend bundle, and chat migrations match this source revision."
}

bootstrap_application_accounts() {
    local job_name="blockgo-app-bootstrap"
    local bootstrap_memory_request="128Mi"
    local bootstrap_memory_limit="192Mi"

    if [[ "$PROFILE" == "local" ]]; then
        bootstrap_memory_request="16Mi"
        bootstrap_memory_limit="64Mi"
    fi

    echo "Bootstrapping application administrator accounts..."
    kubectl delete job "$job_name" -n plv-fabric --ignore-not-found --wait=true >/dev/null

    cat <<EOF | kubectl apply -f - >/dev/null
apiVersion: batch/v1
kind: Job
metadata:
  name: blockgo-app-bootstrap
  namespace: plv-fabric
  labels:
    app: blockgo-app-bootstrap
spec:
  backoffLimit: 2
  activeDeadlineSeconds: 300
  template:
    metadata:
      labels:
        app: blockgo-app-bootstrap
    spec:
      restartPolicy: Never
      containers:
      - name: bootstrap
        image: busybox:1.36.1
        imagePullPolicy: IfNotPresent
        env:
        - name: INTERNAL_API_KEY
          valueFrom:
            secretKeyRef:
              name: blockgo-secrets
              key: INTERNAL_API_KEY
        command: ["/bin/sh", "-ec"]
        args:
        - >-
          wget -T 15 -qO- --header="x-api-key: \${INTERNAL_API_KEY}"
          http://middleware-api.plv-fabric.svc.cluster.local:4000/api/bootstrap
        resources:
          requests:
            memory: ${bootstrap_memory_request}
            cpu: 10m
          limits:
            memory: ${bootstrap_memory_limit}
            cpu: 50m
EOF

        if ! wait_for_job_completion "$job_name" plv-fabric 300; then
        echo "ERROR: Application account bootstrap failed."
        show_job_diagnostics "$job_name" plv-fabric
        return 1
    fi

    show_job_logs "$job_name" plv-fabric
    kubectl delete job "$job_name" -n plv-fabric --wait=false >/dev/null
    echo "Application administrator bootstrap completed."
}

bootstrap_fabric() {
    if [[ "${FABRIC_BOOTSTRAP:-true}" != "true" ]]; then
        echo "Skipping Fabric channel and chaincode bootstrap because FABRIC_BOOTSTRAP is not true."
        return
    fi

    echo "Bootstrapping the Fabric channel, peers, and chaincode..."
    bash ./k8s/init-channel.sh
    bash ./k8s/join-peers.sh
    bash ./k8s/install-chaincode.sh
}

start_local_frontend() {
    local pid_file=".local-frontend-port-forward.pid"
    local log_file=".local-frontend-port-forward.log"
    local pid=""

    if curl -fsS --max-time 2 http://127.0.0.1:8080/nginx-health >/dev/null 2>&1; then
        echo "Local frontend is already available at http://localhost:8080"
        return
    fi

    if [[ -f "$pid_file" ]]; then
        pid="$(tr -d '[:space:]' < "$pid_file")"
        if [[ "$pid" =~ ^[0-9]+$ ]]; then
            kill -9 "$pid" >/dev/null 2>&1 || true
        fi
        rm -f "$pid_file"
    fi

    rm -f "$log_file"
    nohup kubectl port-forward -n plv-fabric service/frontend-service 8080:80 \
        >"$log_file" 2>&1 </dev/null &
    pid=$!
    echo "$pid" > "$pid_file"

    for _ in $(seq 1 30); do
        if curl -fsS --max-time 2 http://127.0.0.1:8080/nginx-health >/dev/null 2>&1; then
            echo "Local frontend is available at http://localhost:8080"
            return
        fi
        if ! kill -0 "$pid" >/dev/null 2>&1; then
            break
        fi
        sleep 1
    done

    echo "ERROR: Frontend port-forward did not become ready."
    if [[ -f "$log_file" ]]; then
        tail -n 20 "$log_file"
    fi
    return 1
}

stop_local_helpers() {
    echo "Stopping project-local helper processes and Docker Compose services..."

    if [[ -f .local-frontend-port-forward.pid ]]; then
        local frontend_forward_pid
        frontend_forward_pid="$(tr -d '[:space:]' < .local-frontend-port-forward.pid)"
        if [[ "$frontend_forward_pid" =~ ^[0-9]+$ ]]; then
            kill -9 "$frontend_forward_pid" >/dev/null 2>&1 || true
        fi
        rm -f .local-frontend-port-forward.pid
    fi

    if [[ -f .watchdog.pid ]]; then
        local watchdog_pid
        watchdog_pid="$(tr -d '[:space:]' < .watchdog.pid)"
        if [[ "$watchdog_pid" =~ ^[0-9]+$ ]] && \
            ps -p "$watchdog_pid" -o command= 2>/dev/null | grep -q 'nginx_failover_watchdog.sh'; then
            kill -9 "$watchdog_pid" 2>/dev/null || true
        fi
        rm -f .watchdog.pid
    fi

    if command -v pkill >/dev/null 2>&1; then
        pkill -9 -f '[n]ginx_failover_watchdog.sh' 2>/dev/null || true
        pkill -9 -f '[k]ubectl(.exe)?[[:space:]].*port-forward.*(middleware-api|client-app|frontend|ipfs)' 2>/dev/null || true
    fi

    if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
        local compose_args=(
            -f docker-compose-main.yaml
            -f docker-compose-annex.yaml
            -f docker-compose-pubad.yaml
        )
        docker compose "${compose_args[@]}" kill >/dev/null 2>&1 || true
        docker compose "${compose_args[@]}" down --remove-orphans --timeout 0 >/dev/null 2>&1 || true
    fi
}

collect_local_project_pvs() {
    LOCAL_PROJECT_PVS=("${LOCAL_STATIC_PVS[@]}")

    local pv
    local claim_namespace
    while read -r pv claim_namespace; do
        case "$claim_namespace" in
            plv-fabric|plv-main-campus|plv-annex-campus|plv-pubad-campus)
                if [[ " ${LOCAL_PROJECT_PVS[*]} " != *" $pv "* ]]; then
                    LOCAL_PROJECT_PVS+=("$pv")
                fi
                ;;
        esac
    done < <(
        kubectl get pv \
            -o custom-columns=NAME:.metadata.name,NAMESPACE:.spec.claimRef.namespace \
            --no-headers 2>/dev/null || true
    )
}

force_delete_namespace_workloads() {
    local namespace="$1"

    if ! kubectl get namespace "$namespace" >/dev/null 2>&1; then
        return
    fi

    echo "Force-stopping workloads in $namespace..."
    kubectl delete \
        deployment,statefulset,daemonset,replicaset,replicationcontroller,job,cronjob \
        --all -n "$namespace" --ignore-not-found --wait=false >/dev/null 2>&1 || true
    kubectl delete pod --all -n "$namespace" --ignore-not-found \
        --grace-period=0 --force --wait=false >/dev/null 2>&1 || true
    kubectl wait --for=delete pod --all -n "$namespace" --timeout=20s >/dev/null 2>&1 || true

    local pod
    while read -r pod; do
        [[ -z "$pod" ]] && continue
        kubectl patch "$pod" -n "$namespace" --type=merge \
            -p '{"metadata":{"finalizers":[]}}' >/dev/null 2>&1 || true
        kubectl delete "$pod" -n "$namespace" --ignore-not-found \
            --grace-period=0 --force --wait=false >/dev/null 2>&1 || true
    done < <(kubectl get pod -n "$namespace" -o name 2>/dev/null || true)

    kubectl delete pvc --all -n "$namespace" --ignore-not-found --wait=false >/dev/null 2>&1 || true

    local pvc
    while read -r pvc; do
        [[ -z "$pvc" ]] && continue
        kubectl patch "$pvc" -n "$namespace" --type=merge \
            -p '{"metadata":{"finalizers":[]}}' >/dev/null 2>&1 || true
        kubectl delete "$pvc" -n "$namespace" --ignore-not-found --wait=false >/dev/null 2>&1 || true
    done < <(kubectl get pvc -n "$namespace" -o name 2>/dev/null || true)
}

force_delete_local_resources() {
    echo "Force-deleting the local PLV deployment..."
    stop_local_helpers
    collect_local_project_pvs

    local namespace
    for namespace in "${NAMESPACES[@]}"; do
        force_delete_namespace_workloads "$namespace"
    done

    kubectl delete namespace "${NAMESPACES[@]}" \
        --ignore-not-found --wait=false >/dev/null 2>&1 || true

    local namespace_refs=()
    for namespace in "${NAMESPACES[@]}"; do
        namespace_refs+=("namespace/$namespace")
    done
    kubectl wait --for=delete "${namespace_refs[@]}" --timeout=45s >/dev/null 2>&1 || true

    local cleanup_failed=false
    for namespace in "${NAMESPACES[@]}"; do
        if kubectl get namespace "$namespace" >/dev/null 2>&1; then
            echo "ERROR: Namespace $namespace is still terminating. Refusing to force-finalize it because that can orphan PVCs."
            cleanup_failed=true
        fi
    done
    if [[ "$cleanup_failed" == "true" ]]; then
        return 1
    fi

    echo "Deleting local PersistentVolumes claimed by the PLV deployment..."
    local pv
    for pv in "${LOCAL_PROJECT_PVS[@]}"; do
        kubectl patch pv "$pv" --type=merge \
            -p '{"metadata":{"finalizers":[]}}' >/dev/null 2>&1 || true
        kubectl delete pv "$pv" --ignore-not-found --wait=false >/dev/null 2>&1 || true
    done

    cleanup_failed=false
    for namespace in "${NAMESPACES[@]}"; do
        if kubectl get namespace "$namespace" >/dev/null 2>&1; then
            echo "ERROR: Namespace $namespace is still present after forced cleanup."
            cleanup_failed=true
        fi
    done
    for pv in "${LOCAL_PROJECT_PVS[@]}"; do
        if kubectl get pv "$pv" >/dev/null 2>&1; then
            echo "ERROR: PersistentVolume $pv is still present after forced cleanup."
            cleanup_failed=true
        fi
    done

    if [[ "$cleanup_failed" == "true" ]]; then
        return 1
    fi

    echo "Local PLV workloads, namespaces, claims, and volumes were force-deleted."
    echo "Host files under ./fabric-k8s-data were preserved."
}

delete_resources() {
    if [[ "$PROFILE" == "local" ]]; then
        force_delete_local_resources
        return
    fi

    echo "Deleting K8s namespaces and namespace-scoped PVCs..."
    for ns in "${NAMESPACES[@]}"; do
        kubectl delete pvc --all -n "$ns" --ignore-not-found
    done
    kubectl delete namespace "${NAMESPACES[@]}" --ignore-not-found
    for ns in "${NAMESPACES[@]}"; do
        kubectl wait --for=delete "namespace/$ns" --timeout=5m 2>/dev/null || true
    done
    echo "Resources deleted."
}

show_status() {
    kubectl get pods -A
    kubectl get svc -A
}

main() {
    case "$ACTION" in
        verify)
            verify_deployment_inputs
            ;;
        apply)
            check_kubectl
            check_cluster
            validate_production_image_settings
            inject_configs

            echo "======================================"
            echo "Creating Fabric Crypto Secrets"
            echo "======================================"

            local_crypto_script="./k8s/create-crypto-secrets.sh"

            if [[ ! -f "$local_crypto_script" ]]; then
                echo "ERROR: Missing:"
                echo "  $local_crypto_script"
                exit 1
            fi

            # Handle scripts edited from Windows.
            sed -i 's/\r$//' "$local_crypto_script"
            chmod +x "$local_crypto_script"

            if ! bash "$local_crypto_script"; then
                echo "ERROR: Fabric crypto secret generation failed."
                echo "Kubernetes deployment has been stopped."
                exit 1
            fi

            echo "Crypto Secrets generated successfully."

            deploy_manifests
            wait_deployments
            verify_deployed_application_revision
            bootstrap_application_accounts
            if [[ "$PROFILE" == "local" ]]; then
                start_local_frontend
            fi
            bootstrap_fabric
            echo "Deployment complete."
            ;;
        delete)
            check_kubectl
            check_cluster
            delete_resources
            ;;
        status)
            check_kubectl
            check_cluster
            show_status
            ;;
    esac
}

main "$@"
