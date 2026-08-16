#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// --- Configuration ---
// Adjust these values to match your environment
const ENV_FILE_PATH = '.env';
const PASSWORD_VAR_NAME = 'SYSTEM_ADMIN_PASSWORD'; // The variable name for the password in your .env file
const K8S_SECRET_NAME = 'my-app-secrets';          // The name of the Kubernetes Secret to update
const K8S_SECRET_KEY = 'SYSTEM_ADMIN_PASSWORD';    // The key within the secret that holds the password
const K8S_DEPLOYMENT_NAME = 'middleware-service';  // The name of your middleware deployment
const K8S_NAMESPACE = 'default';                   // The Kubernetes namespace
// ---------------------

/**
 * A simple utility to run shell commands and log their output.
 * @param {string} command The command to execute.
 */
function runCommand(command) {
  console.log(`\n  Executing: ${command}`);
  try {
    const output = execSync(command, { stdio: 'inherit' }); // 'inherit' shows command output in real-time
  } catch (error) {
    console.error(`\n Command failed: ${command}`);
    console.error(error.message);
    process.exit(1); // Exit the script with an error code
  }
}

/**
 * Parses a .env file to find a specific variable's value.
 * @param {string} filePath Path to the .env file.
 * @param {string} varName The variable name to find.
 * @returns {string} The value of the variable.
 */
function getPasswordFromEnv(filePath, varName) {
  console.log(`\n Reading password from ${filePath}...`);
  if (!fs.existsSync(filePath)) {
    console.error(` Error: Environment file not found at ${filePath}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(filePath, 'utf8');
  const lines = fileContent.split('\n');
  const passwordLine = lines.find(line => line.trim().startsWith(`${varName}=`));

  if (!passwordLine) {
    console.error(` Error: Variable "${varName}" not found in ${filePath}`);
    process.exit(1);
  }

  const password = passwordLine.split('=')[1].trim().replace(/['"]/g, ''); // Get value and remove quotes
  if (!password) {
    console.error(` Error: Password for "${varName}" is empty.`);
    process.exit(1);
  }

  console.log(` Password found for user "system-admin".`);
  return password;
}

// --- Main Bootstrap Logic ---
function main() {
  console.log(' Starting system-admin bootstrap process...');

  // 1. Get the password from the .env file
  const adminPassword = getPasswordFromEnv(ENV_FILE_PATH, PASSWORD_VAR_NAME);

  // 2. Update the Kubernetes Secret
  // This command creates the secret if it doesn't exist or updates it if it does.
  // Using --from-literal is secure for automation as it avoids saving the password to a temp file.
  const updateSecretCommand = `
    kubectl create secret generic ${K8S_SECRET_NAME} \
      --namespace=${K8S_NAMESPACE} \
      --from-literal=${K8S_SECRET_KEY}=${adminPassword} \
      --dry-run=client -o yaml | kubectl apply -f -
  `;
  runCommand(updateSecretCommand.trim().replace(/\s+/g, ' '));
  console.log(` Kubernetes Secret "${K8S_SECRET_NAME}" has been created/updated.`);

  // 3. Restart the middleware to clear the limiter and apply the new secret
  const restartCommand = `kubectl rollout restart deployment/${K8S_DEPLOYMENT_NAME} --namespace=${K8S_NAMESPACE}`;
  runCommand(restartCommand);
  console.log(` Middleware deployment restart initiated.`);

  // 4. Wait for the rollout to complete
  const statusCommand = `kubectl rollout status deployment/${K8S_DEPLOYMENT_NAME} --namespace=${K8S_NAMESPACE}`;
  runCommand(statusCommand);
  console.log(`\n Bootstrap complete! The system-admin account should now be provisioned and accessible.`);
}

main();