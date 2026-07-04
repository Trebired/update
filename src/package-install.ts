import { spawn } from "node:child_process";

import type {
  UpdateArtifact,
  UpdateLifecycleHandler,
  UpdatePackageInstallResult,
  UpdatePackageInstaller,
} from "#types";

export async function executePackageInstall(input: {
  artifact: UpdateArtifact;
  filePath: string;
  installer?: UpdatePackageInstaller;
  lifecycleHandler?: UpdateLifecycleHandler;
  workingDirectory: string;
}): Promise<UpdatePackageInstallResult> {
  const installer = input.installer ?? createHostPackageInstaller();
  return installer.install({
    artifact: input.artifact,
    filePath: input.filePath,
    lifecycle: input.lifecycleHandler,
    workingDirectory: input.workingDirectory,
  });
}

export function createHostPackageInstaller(): UpdatePackageInstaller {
  return {
    async install(input) {
      const command = resolvePackageCommand(input.artifact, input.filePath);
      await runPackageCommand(command.command, command.args, input.workingDirectory);

      return {
        details: {
          args: command.args,
          command: command.command,
        },
        installedAt: new Date().toISOString(),
        restartRequired: true,
      };
    },
  };
}

function resolvePackageCommand(artifact: UpdateArtifact, filePath: string) {
  if (artifact.installStrategy === "deb") {
    return {
      args: ["-i", filePath],
      command: "dpkg",
    };
  }

  if (artifact.installStrategy === "rpm") {
    return {
      args: ["-Uvh", "--replacepkgs", filePath],
      command: "rpm",
    };
  }

  throw new Error(`Artifact ${artifact.id} does not use a package install strategy.`);
}

async function runPackageCommand(command: string, args: string[], workingDirectory: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workingDirectory,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
    });
  });
}
