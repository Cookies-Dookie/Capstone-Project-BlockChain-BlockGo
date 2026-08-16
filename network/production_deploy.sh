#!/bin/bash
# =================================================================
# BLOCKGO - PRODUCTION DEPLOYMENT SCRIPT FOR GKE
# =================================================================
# This script is designed for deploying the application to a
# production-like GKE environment. It assumes that all necessary
# cryptographic materials and channel artifacts have been generated
# by `full_deploy.sh` and are securely stored as Kubernetes secrets.
#
# It also assumes you are using a container registry like GCR or GAR.
# =================================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# --- Configuration ---
# Ensure these environment variables are set in your CI/CD environment
if [ -z "$IMAGE_REGISTRY" ]; then
    log_error "IMAGE_REGISTRY is not set. Example: us-central1-docker.pkg.dev/your-gcp-project/your-repo"
fi
if [ -z "$GCP_PROJECT_ID" ]; then
    log_error "GCP_PROJECT_ID is not set."
fi

ACTION=${1:-apply}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

check_prerequisites() {
    log_info "Checking prerequisites..."
    command -v kubectl >/dev/null 2>&1 || log_error "kubectl not found. Please install and configure it."
    command -v gcloud >/dev/null 2>&1 || log_error "gcloud not found. Please install and configure it."
    command -v docker >/dev/null 2>&1 || log_error "docker not found. Please install it."
    log_info "✓ All prerequisites are met."
}

fix_docker_creds() {
    log_info "Checking for Docker credential helper issues (common in WSL)..."
    local DOCKER_CONFIG_FILE="$HOME/.docker/config.json"
    if [ -f "$DOCKER_CONFIG_FILE" ]; then
        if grep -q "desktop.exe" "$DOCKER_CONFIG_FILE"; then
            log_warn "Windows Docker credential helper detected in Linux environment."
            log_info "Applying fix by removing 'credsStore' from $DOCKER_CONFIG_FILE."
            
            # Create a backup
            cp "$DOCKER_CONFIG_FILE" "$DOCKER_CONFIG_FILE.bak"
            
            # Use sed as it's more likely to be available than jq
            # This command deletes lines containing "credsStore"
            sed -i '/"credsStore":/d' "$DOCKER_CONFIG_FILE"
            log_info "✓ Docker config fixed. Backup created at $DOCKER_CONFIG_FILE.bak"
        else
            log_info "✓ No credential helper issues found."
        fi
    fi
}

configure_gcloud() {
    log_info "Configuring gcloud and Docker..."
    gcloud auth configure-docker "$(echo $IMAGE_REGISTRY | cut -d'/' -f1)" -q || log_error "Failed to configure Docker with gcloud."
    log_info "✓ gcloud configured successfully."
}

build_and_push_images() {
    log_info "Building and pushing application images to $IMAGE_REGISTRY..."
    local services=("middleware" "frontend" "client-app" "chaincode")
    for service in "${services[@]}"; do
        log_info "Building $service..."
        if [ "$service" == "chaincode" ]; then
            # In this project, multiple chaincode services use the same Dockerfile
            docker build -t "$IMAGE_REGISTRY/registrar-chaincode:latest" -f "../chaincode/Dockerfile" ../chaincode
            docker build -t "$IMAGE_REGISTRY/faculty-chaincode:latest" -f "../chaincode/Dockerfile" ../chaincode
            docker build -t "$IMAGE_REGISTRY/department-chaincode:latest" -f "../chaincode/Dockerfile" ../chaincode
            log_info "Pushing chaincode images..."
            docker push "$IMAGE_REGISTRY/registrar-chaincode:latest"
            docker push "$IMAGE_REGISTRY/faculty-chaincode:latest"
            docker push "$IMAGE_REGISTRY/department-chaincode:latest"
        else
            if [ "$service" == "client-app" ]; then
                log_info "Cleaning .NET build artifacts for client-app to prevent WSL permission errors..."
                rm -rf ../client-app/obj ../client-app/bin
            fi
            docker build -t "$IMAGE_REGISTRY/$service:latest" -f "../$service/Dockerfile" "../$service"
            log_info "Pushing $service:latest..."
            docker push "$IMAGE_REGISTRY/$service:latest"
        fi
    done
    log_info "✓ All images built and pushed."
}

deploy_to_gke() {
    log_info "Deploying manifests to GKE cluster..."

    # IMPORTANT: In a real production environment, you should use Kustomize or Helm
    # to manage environment-specific configurations instead of sed.
    # The following `sed` commands are removed in favor of a more robust approach.
    # Your Kubernetes manifests should be parameterized to use environment variables
    # or a ConfigMap for the image registry path.

    # Example of what a Kustomize approach would look like:
    # 1. Create a `kustomization.yaml` in the `k8s` directory.
    # 2. Add all your .yaml files to the `resources` section.
    # 3. Use `images` transformer to set the new image path:
    #    images:
    #    - name: registry.example.com/plv-repo/fabric-middleware
    #      newName: us-central1-docker.pkg.dev/your-gcp-project/your-repo/fabric-middleware
    #      newTag: latest
    # 4. Run `kubectl apply -k ./k8s`

    log_warn "This script applies raw YAMLs. For production, consider using Kustomize or Helm."

    # The original script used `sed` to replace image paths. A better way is to
    # ensure your YAML files can accept an environment variable for the registry.
    # Since we don't have the YAMLs to modify, we will proceed like the original
    # but with a warning.

    TMP_K8S_DIR="./k8s/.tmp-k8s-prod"
    rm -rf "$TMP_K8S_DIR" && mkdir -p "$TMP_K8S_DIR"
    cp ./k8s/*.yaml "$TMP_K8S_DIR/"

    # This part is kept for compatibility but is NOT recommended for production.
    find "$TMP_K8S_DIR" -type f -name "*.yaml" -exec sed -i "s|registry.example.com/plv-repo|$IMAGE_REGISTRY|g" {} +

    log_info "Applying base infrastructure..."
    kubectl $ACTION -f "$TMP_K8S_DIR/00-namespace.yaml"
    kubectl $ACTION -f "$TMP_K8S_DIR/01a-storage-class.yaml"

    log_info "Applying secrets and configurations..."
    log_warn "This deployment assumes secrets (api keys, db passwords) and crypto materials are already securely populated in the cluster."
    log_warn "Refer to your secret management tool (e.g., Google Secret Manager, Vault) integration."
    # The `create-crypto-secrets.sh` and `.env` injection from the original script
    # should be replaced by a secure CI/CD pipeline step.

    log_info "Deploying application services..."
    for manifest in "$TMP_K8S_DIR"/*.yaml; do
        filename=$(basename "$manifest")
        if [[ "$filename" > "01" ]]; then
            log_info "Applying $filename..."
            kubectl $ACTION -f "$manifest"
        fi
    done

    rm -rf "$TMP_K8S_DIR"
    log_info "✓ All manifests applied."
}

main() {
    log_info "Starting Production Deployment for PLV BLOCKGO"
    log_info "=============================================="

    if [ "$ACTION" == "apply" ]; then
        check_prerequisites
        fix_docker_creds
        configure_gcloud
        build_and_push_images
        deploy_to_gke
        log_info "Deployment process initiated. Monitor rollout status with 'kubectl get pods -A -w'"
    elif [ "$ACTION" == "delete" ]; then
        check_prerequisites
        log_warn "This will delete all project resources from the cluster."
        read -p "Are you sure you want to continue? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            kubectl delete namespace plv-fabric plv-main-campus plv-annex-campus plv-pubad-campus --ignore-not-found || true
            log_info "✓ Namespaces deleted."
        else
            log_info "Deletion cancelled."
        fi
    else
        log_error "Invalid action: '$ACTION'. Use 'apply' or 'delete'."
    fi

    log_info "=============================================="
    log_info "Production Deployment Script Finished."
}

main