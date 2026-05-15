import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import type * as PacketLifecycle from "./agent-packet-lifecycle.js";
import type * as BranchCleanup from "./post-merge-cleanup/branch-cleanup.js";
import type * as Executor from "./post-merge-cleanup/executor.js";
import type * as Metadata from "./post-merge-cleanup/metadata.js";
import type * as Validator from "./post-merge-cleanup/validator.js";
import type {
  CleanupEvidenceInput,
  CleanupMetadata,
} from "./post-merge-cleanup/types.js";

const { findRepoRoot, resolveCliPath, sha256 }: typeof PacketLifecycle =
  createRequire(import.meta.url)(
    "./agent-packet-lifecycle.ts",
  ) as typeof PacketLifecycle;
const { parseCleanupMetadataBlock }: typeof Metadata = createRequire(
  import.meta.url,
)("./post-merge-cleanup/metadata.ts") as typeof Metadata;
const { buildWorkflowCleanupEvidenceBundle }: typeof Metadata = createRequire(
  import.meta.url,
)("./post-merge-cleanup/metadata.ts") as typeof Metadata;
const { validateWorkflowCleanupMetadataGuard }: typeof Metadata = createRequire(
  import.meta.url,
)("./post-merge-cleanup/metadata.ts") as typeof Metadata;
const { evaluateBranchCleanup, renderBranchCleanupLog }: typeof BranchCleanup =
  createRequire(import.meta.url)(
    "./post-merge-cleanup/branch-cleanup.ts",
  ) as typeof BranchCleanup;
const { executePacketCleanupPlan, finalizePacketCleanupPlan }: typeof Executor =
  createRequire(import.meta.url)(
    "./post-merge-cleanup/executor.ts",
  ) as typeof Executor;
const {
  buildBoundCleanupPlan,
  buildCleanupDryRunPlan,
  validateBoundCleanupPlanArtifact,
}: typeof Validator = createRequire(import.meta.url)(
  "./post-merge-cleanup/validator.ts",
) as typeof Validator;

async function main() {
  const parsedRoot = parseRepoRootArg(process.argv.slice(2));
  const args = parsedRoot.args;

  try {
    const repoRoot = parsedRoot.repoRoot ?? findRepoRoot();
    const executePlanFile = parseSinglePathArg(args, "--execute-plan-file");
    const finalizePlanFile = parseSinglePathArg(args, "--finalize-plan-file");
    const workflowEvidenceOutput = await parseWorkflowEvidenceOutput(args);
    if (workflowEvidenceOutput !== null) {
      const bundle = buildWorkflowCleanupEvidenceBundle(
        workflowEvidenceOutput.input,
      );
      await mkdir(path.dirname(workflowEvidenceOutput.metadataSourceFile), {
        recursive: true,
      });
      await mkdir(path.dirname(workflowEvidenceOutput.evidenceJsonFile), {
        recursive: true,
      });
      await writeFile(
        workflowEvidenceOutput.metadataSourceFile,
        bundle.metadataSource,
      );
      await writeFile(
        workflowEvidenceOutput.evidenceJsonFile,
        `${JSON.stringify(bundle.evidence, null, 2)}\n`,
      );
      process.stdout.write(
        `${JSON.stringify(
          {
            evidenceJsonFile: workflowEvidenceOutput.evidenceJsonFile,
            metadataSourceFile: workflowEvidenceOutput.metadataSourceFile,
            metadataSourceRef: bundle.metadataSourceRef,
            status: "valid",
          },
          null,
          2,
        )}\n`,
      );
      return;
    }
    const sourceRefPreview = await parseSourceRefPreview(args);
    if (sourceRefPreview !== null) {
      process.stdout.write(`${JSON.stringify(sourceRefPreview, null, 2)}\n`);
      return;
    }
    const handoffGuard = await parseCleanupHandoffGuard(args);
    if (handoffGuard !== null) {
      const result = validateWorkflowCleanupMetadataGuard(handoffGuard.input, {
        requireCleanupMetadataGuardStatus:
          handoffGuard.requireCleanupMetadataGuardStatus,
      });
      process.stdout.write(
        `${JSON.stringify({ status: "valid", ...result }, null, 2)}\n`,
      );
      return;
    }
    const branchCleanupPlanFile = parseSinglePathArg(
      args,
      "--branch-cleanup-plan-file",
    );
    const branchCleanupStateFile = parseSinglePathArg(
      args,
      "--branch-cleanup-state-json-file",
    );
    const branchCleanupOutputFile = parseSinglePathArg(
      args,
      "--branch-cleanup-output-file",
    );
    if (branchCleanupPlanFile !== null || branchCleanupStateFile !== null) {
      if (branchCleanupPlanFile === null || branchCleanupStateFile === null) {
        throw new Error(
          "Branch cleanup requires --branch-cleanup-plan-file and --branch-cleanup-state-json-file.",
        );
      }
      const plan = validateBoundCleanupPlanArtifact(
        JSON.parse(await readFile(branchCleanupPlanFile, "utf8")) as unknown,
      );
      const state = parseBranchCleanupState(
        JSON.parse(await readFile(branchCleanupStateFile, "utf8")) as unknown,
      );
      const decisions = evaluateBranchCleanup({
        branchStates: state.branchStates,
        defaultBranch: plan.mergedPullRequest.baseBranch,
        mergedPrHeadBranch: state.mergedPrHeadBranch,
        packetCleanupSucceeded: state.packetCleanupSucceeded,
        requestedBranches: plan.branches,
      });
      const output = {
        decisions,
        log: renderBranchCleanupLog(decisions),
      };
      const outputJson = `${JSON.stringify(output, null, 2)}\n`;
      if (branchCleanupOutputFile !== null) {
        await mkdir(path.dirname(branchCleanupOutputFile), { recursive: true });
        await writeFile(branchCleanupOutputFile, outputJson);
      } else {
        process.stdout.write(outputJson);
      }
      return;
    }

    if (executePlanFile !== null || finalizePlanFile !== null) {
      if (executePlanFile !== null && finalizePlanFile !== null) {
        throw new Error(
          "Ambiguous cleanup execution input: provide only one execution plan mode.",
        );
      }
      const planFile = executePlanFile ?? finalizePlanFile;
      if (planFile === null) {
        throw new Error("Missing cleanup execution plan file.");
      }
      const plan = JSON.parse(await readFile(planFile, "utf8")) as unknown;
      const trustedMainSha = readTrustedHeadSha(repoRoot);
      if (executePlanFile !== null) {
        await executePacketCleanupPlan({
          plan,
          planFile: executePlanFile,
          repoRoot,
          trustedMainSha,
        });
      } else {
        await finalizePacketCleanupPlan({ plan, repoRoot, trustedMainSha });
      }
      return;
    }

    const evidence = await parseEvidenceInput(args);
    const metadataInput = await parseMetadataInput(args, evidence);
    const trustedMainSha = readTrustedHeadSha(repoRoot);
    const preflightPlanFile = parsePreflightPlanFile(args);
    const plan = await buildCleanupDryRunPlan({
      evidence,
      metadata: metadataInput.metadata,
      metadataSourceRef: metadataInput.metadataSourceRef,
      repoRoot,
      trustedMainSha,
    });

    if (preflightPlanFile !== null) {
      const artifact = buildBoundCleanupPlan({
        generatedAt: new Date().toISOString(),
        inputsHash: buildInputsHash({
          evidence,
          metadata: metadataInput.metadata,
          metadataSourceRef: metadataInput.metadataSourceRef,
          trustedMainSha,
        }),
        plan,
      });
      await mkdir(path.dirname(preflightPlanFile), { recursive: true });
      await writeFile(
        preflightPlanFile,
        `${JSON.stringify(artifact, null, 2)}\n`,
      );
      process.stdout.write(
        `${JSON.stringify({ planFile: preflightPlanFile, status: "valid" }, null, 2)}\n`,
      );
      return;
    }

    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

async function parseCleanupHandoffGuard(args: string[]): Promise<{
  input: Metadata.WorkflowCleanupMetadataGuardInput;
  requireCleanupMetadataGuardStatus: boolean;
} | null> {
  const requireCleanupMetadataGuardStatus = args.includes(
    "--require-cleanup-guard-status",
  );
  const handoffJsonFile = parseSinglePathArg(
    args,
    "--validate-cleanup-handoff-json-file",
  );
  if (handoffJsonFile !== null) {
    return {
      input: parseCleanupHandoffJson(
        JSON.parse(await readFile(handoffJsonFile, "utf8")) as unknown,
      ),
      requireCleanupMetadataGuardStatus,
    };
  }

  if (!args.includes("--validate-cleanup-handoff")) {
    return null;
  }

  let prNumber: number | null = null;
  let prBody: string | null = null;
  let prBodyFile: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (
      token === "--validate-cleanup-handoff" ||
      token === "--require-cleanup-guard-status" ||
      token === "--"
    ) {
      continue;
    }

    if (token === "--pr-number") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --pr-number.");
      }
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error("--pr-number must be a positive integer.");
      }
      prNumber = parsed;
      index += 1;
      continue;
    }

    if (token === "--pr-body") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --pr-body.");
      }
      prBody = value;
      index += 1;
      continue;
    }

    if (token === "--pr-body-file") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --pr-body-file.");
      }
      prBodyFile = resolveCliPath(value, process.cwd());
      index += 1;
      continue;
    }

    throw new Error(`Unexpected cleanup handoff argument: ${String(token)}`);
  }

  if (prNumber === null) {
    throw new Error("Cleanup handoff validation requires --pr-number.");
  }
  if ((prBody === null) === (prBodyFile === null)) {
    throw new Error(
      "Cleanup handoff validation requires exactly one --pr-body or --pr-body-file.",
    );
  }

  return {
    input: {
      issueComments: [],
      pullRequest: {
        body:
          prBodyFile === null
            ? (prBody ?? "")
            : await readFile(prBodyFile, "utf8"),
        number: prNumber,
        updatedAt: "1970-01-01T00:00:00.000Z",
      },
    },
    requireCleanupMetadataGuardStatus,
  };
}

async function parseWorkflowEvidenceOutput(args: string[]): Promise<{
  evidenceJsonFile: string;
  input: Metadata.WorkflowCleanupEvidenceInput;
  metadataSourceFile: string;
} | null> {
  const workflowEvidenceFile = parseSinglePathArg(
    args,
    "--workflow-evidence-json-file",
  );
  if (workflowEvidenceFile === null) {
    return null;
  }

  const metadataSourceFile = parseSinglePathArg(
    args,
    "--metadata-source-output-file",
  );
  const evidenceJsonFile = parseSinglePathArg(
    args,
    "--evidence-json-output-file",
  );

  if (metadataSourceFile === null || evidenceJsonFile === null) {
    throw new Error(
      "Workflow cleanup evidence requires --metadata-source-output-file and --evidence-json-output-file.",
    );
  }

  const allowedArgs = new Set([
    "--",
    "--workflow-evidence-json-file",
    "--metadata-source-output-file",
    "--evidence-json-output-file",
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === undefined) {
      throw new Error("Unexpected missing CLI token.");
    }
    if (!allowedArgs.has(token)) {
      throw new Error(
        `Unexpected workflow cleanup evidence argument: ${token}`,
      );
    }
    if (token !== "--") {
      index += 1;
    }
  }

  return {
    evidenceJsonFile,
    input: parseWorkflowCleanupEvidenceJson(
      JSON.parse(await readFile(workflowEvidenceFile, "utf8")) as unknown,
    ),
    metadataSourceFile,
  };
}

function parseWorkflowCleanupEvidenceJson(
  value: unknown,
): Metadata.WorkflowCleanupEvidenceInput {
  const root = requireRecord(value, "workflow cleanup evidence input");
  const pullRequest = requireRecord(
    root["pullRequest"],
    "workflow cleanup evidence pullRequest",
  );
  const changedFiles = root["changedFiles"];
  const issueComments = root["issueComments"];
  const reviews = root["reviews"];

  if (!Array.isArray(changedFiles)) {
    throw new Error("Workflow cleanup evidence changedFiles must be an array.");
  }
  if (!Array.isArray(issueComments)) {
    throw new Error(
      "Workflow cleanup evidence issueComments must be an array.",
    );
  }
  if (!Array.isArray(reviews)) {
    throw new Error("Workflow cleanup evidence reviews must be an array.");
  }

  return {
    changedFiles: changedFiles.map((file) => parseWorkflowChangedFile(file)),
    defaultBranch: requireJsonString(root["defaultBranch"], "defaultBranch"),
    ...(typeof root["eventSenderUserType"] === "string"
      ? {
          eventSenderUserType: requireJsonString(
            root["eventSenderUserType"],
            "eventSenderUserType",
          ),
        }
      : {}),
    issueComments: issueComments.map((comment) =>
      parseWorkflowIssueComment(comment),
    ),
    pullRequest: {
      baseRef: requireJsonString(pullRequest["baseRef"], "pullRequest.baseRef"),
      body: requireJsonString(pullRequest["body"], "pullRequest.body"),
      createdAt: requireJsonString(
        pullRequest["createdAt"],
        "pullRequest.createdAt",
      ),
      headRef: requireJsonString(pullRequest["headRef"], "pullRequest.headRef"),
      mergeCommitSha: requireJsonString(
        pullRequest["mergeCommitSha"],
        "pullRequest.mergeCommitSha",
      ),
      merged: requireJsonBoolean(pullRequest["merged"], "pullRequest.merged"),
      mergedAt: requireJsonString(
        pullRequest["mergedAt"],
        "pullRequest.mergedAt",
      ),
      number: requireJsonInteger(pullRequest["number"], "pullRequest.number"),
      updatedAt: requireJsonString(
        pullRequest["updatedAt"],
        "pullRequest.updatedAt",
      ),
    },
    reviews: reviews.map((review) => parseWorkflowReview(review)),
  };
}

function parseWorkflowReview(value: unknown): Metadata.WorkflowReviewInput {
  const root = requireRecord(value, "workflow cleanup evidence review");
  return {
    body: requireJsonString(root["body"], "reviews[].body"),
    id: requireJsonStringOrNumber(root["id"], "reviews[].id"),
    state: requireJsonString(root["state"], "reviews[].state"),
    submittedAt: requireJsonString(
      root["submittedAt"],
      "reviews[].submittedAt",
    ),
    userType: requireJsonString(root["userType"], "reviews[].userType"),
  };
}

function parseCleanupHandoffJson(
  value: unknown,
): Metadata.WorkflowCleanupMetadataGuardInput {
  const root = requireRecord(value, "cleanup handoff input");
  const pullRequest = requireRecord(
    root["pullRequest"],
    "cleanup handoff pullRequest",
  );
  const issueComments = root["issueComments"];
  if (!Array.isArray(issueComments)) {
    throw new Error("Cleanup handoff issueComments must be an array.");
  }
  return {
    ...(Array.isArray(root["allowedBranches"])
      ? {
          allowedBranches: parseJsonStringArray(
            root["allowedBranches"],
            "allowedBranches",
          ),
        }
      : {}),
    ...(Array.isArray(root["changedFiles"])
      ? {
          changedFiles: root["changedFiles"].map((file) =>
            parseWorkflowChangedFile(file),
          ),
        }
      : {}),
    issueComments: issueComments.map((comment) =>
      parseWorkflowIssueComment(comment),
    ),
    pullRequest: {
      body: requireJsonString(pullRequest["body"], "pullRequest.body"),
      ...(typeof pullRequest["headRef"] === "string"
        ? {
            headRef: requireJsonString(
              pullRequest["headRef"],
              "pullRequest.headRef",
            ),
          }
        : {}),
      number: requireJsonInteger(pullRequest["number"], "pullRequest.number"),
      updatedAt: requireJsonString(
        pullRequest["updatedAt"],
        "pullRequest.updatedAt",
      ),
    },
    ...(Array.isArray(root["statusChecks"])
      ? {
          statusChecks: root["statusChecks"].map((check) =>
            parseWorkflowStatusCheck(check),
          ),
        }
      : {}),
  };
}

function parseWorkflowChangedFile(
  value: unknown,
): Metadata.WorkflowChangedFileInput {
  if (typeof value === "string") {
    return { filename: value };
  }

  const root = requireRecord(value, "cleanup handoff changed file");
  return {
    filename: requireJsonString(root["filename"], "changedFiles[].filename"),
  };
}

function parseWorkflowStatusCheck(
  value: unknown,
): Metadata.WorkflowStatusCheckInput {
  const root = requireRecord(value, "cleanup handoff status check");
  const check: Metadata.WorkflowStatusCheckInput = {
    name: requireJsonString(root["name"], "statusChecks[].name"),
  };

  for (const key of ["bucket", "conclusion", "state", "status"] as const) {
    if (root[key] !== undefined) {
      check[key] = requireJsonString(root[key], `statusChecks[].${key}`);
    }
  }

  return check;
}

function parseWorkflowIssueComment(
  value: unknown,
): Metadata.WorkflowIssueCommentInput {
  const root = requireRecord(value, "cleanup handoff issue comment");
  const comment: Metadata.WorkflowIssueCommentInput = {
    body: requireJsonString(root["body"], "issueComments[].body"),
    createdAt: requireJsonString(
      root["createdAt"],
      "issueComments[].createdAt",
    ),
    id: requireJsonStringOrNumber(root["id"], "issueComments[].id"),
    updatedAt: requireJsonString(
      root["updatedAt"],
      "issueComments[].updatedAt",
    ),
    userType: requireJsonString(root["userType"], "issueComments[].userType"),
  };
  if (typeof root["authorAssociation"] === "string") {
    comment.authorAssociation = root["authorAssociation"];
  }
  return comment;
}

function requireJsonString(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new Error(`Cleanup handoff ${label} must be a string.`);
  }
  return value;
}

function requireJsonStringOrNumber(value: unknown, label: string) {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`Cleanup handoff ${label} must be a string or number.`);
  }
  return value;
}

function requireJsonBoolean(value: unknown, label: string) {
  if (typeof value !== "boolean") {
    throw new Error(`Cleanup handoff ${label} must be a boolean.`);
  }
  return value;
}

function parseJsonStringArray(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new Error(`Cleanup handoff ${label} must be an array.`);
  }

  return value.map((entry, index) =>
    requireJsonString(entry, `${label}[${String(index)}]`),
  );
}

function requireJsonInteger(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`Cleanup handoff ${label} must be an integer.`);
  }
  return value;
}

function parseBranchCleanupState(value: unknown) {
  const root = requireRecord(value, "branch cleanup state");
  const packetCleanupSucceeded = root["packetCleanupSucceeded"];
  const mergedPrHeadBranch = root["mergedPrHeadBranch"];
  const branchStates = root["branchStates"];
  if (typeof packetCleanupSucceeded !== "boolean") {
    throw new Error(
      "Branch cleanup state packetCleanupSucceeded must be boolean.",
    );
  }
  if (typeof mergedPrHeadBranch !== "string") {
    throw new Error("Branch cleanup state mergedPrHeadBranch must be string.");
  }
  if (!Array.isArray(branchStates)) {
    throw new Error("Branch cleanup state branchStates must be an array.");
  }
  return {
    branchStates: branchStates.map((entry) => parseBranchState(entry)),
    mergedPrHeadBranch,
    packetCleanupSucceeded,
  };
}

function parseBranchState(value: unknown): BranchCleanup.BranchCleanupState {
  const root = requireRecord(value, "branch cleanup branch state");
  const name = root["name"];
  const protectedBranch = root["protected"];
  const aheadByDefault = root["aheadByDefault"];
  const associatedWithCleanup = root["associatedWithCleanup"];
  const deletionError = root["deletionError"];
  if (typeof name !== "string") {
    throw new Error("Branch cleanup branch state name must be string.");
  }
  if (typeof protectedBranch !== "boolean") {
    throw new Error("Branch cleanup branch state protected must be boolean.");
  }
  if (
    typeof aheadByDefault !== "number" ||
    !Number.isSafeInteger(aheadByDefault)
  ) {
    throw new Error(
      "Branch cleanup branch state aheadByDefault must be integer.",
    );
  }
  const state: BranchCleanup.BranchCleanupState = {
    aheadByDefault,
    name,
    protected: protectedBranch,
  };
  if (typeof associatedWithCleanup === "boolean") {
    state.associatedWithCleanup = associatedWithCleanup;
  }
  if (typeof deletionError === "string") {
    state.deletionError = deletionError;
  }
  return state;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function parseRepoRootArg(args: string[]) {
  let repoRoot: string | null = null;
  const remainingArgs: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === undefined) {
      throw new Error("Unexpected missing CLI token.");
    }
    if (token !== "--repo-root") {
      remainingArgs.push(token);
      continue;
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("Missing value for --repo-root.");
    }
    if (repoRoot !== null) {
      throw new Error("Ambiguous cleanup input: provide only one --repo-root.");
    }
    repoRoot = resolveCliPath(value, process.cwd());
    index += 1;
  }

  return { args: remainingArgs, repoRoot };
}

function parseSinglePathArg(args: string[], flag: string) {
  let result: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token !== flag) {
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}.`);
    }
    if (result !== null) {
      throw new Error(`Ambiguous cleanup input: provide only one ${flag}.`);
    }
    result = resolveCliPath(value, process.cwd());
    index += 1;
  }
  return result;
}

function parsePreflightPlanFile(args: string[]) {
  let preflightPlanFile: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token !== "--preflight-plan-file") {
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("Missing value for --preflight-plan-file.");
    }
    if (preflightPlanFile !== null) {
      throw new Error(
        "Ambiguous cleanup input: provide only one preflight plan file.",
      );
    }
    preflightPlanFile = resolveCliPath(value, process.cwd());
    index += 1;
  }
  return preflightPlanFile;
}

async function parseSourceRefPreview(args: string[]) {
  if (!args.includes("--print-source-ref")) {
    return null;
  }

  let kind: string | null = null;
  let sourceId: string | null = null;
  let metadataSource: string | null = null;
  let metadataSourceFile: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === "--print-source-ref" || token === "--") {
      continue;
    }

    if (token === "--metadata-source-kind") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --metadata-source-kind.");
      }
      kind = value;
      index += 1;
      continue;
    }

    if (token === "--metadata-source-id") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --metadata-source-id.");
      }
      sourceId = value;
      index += 1;
      continue;
    }

    if (token === "--metadata-source") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --metadata-source.");
      }
      metadataSource = value;
      index += 1;
      continue;
    }

    if (token === "--metadata-source-file") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --metadata-source-file.");
      }
      metadataSourceFile = resolveCliPath(value, process.cwd());
      index += 1;
      continue;
    }

    throw new Error(
      `Unexpected argument for source-ref preview: ${String(token)}`,
    );
  }

  if (kind !== "pr-body" && kind !== "handoff-comment") {
    throw new Error(
      "Source-ref preview requires --metadata-source-kind pr-body or handoff-comment.",
    );
  }
  if (sourceId === null) {
    throw new Error("Source-ref preview requires --metadata-source-id.");
  }
  if ((metadataSource === null) === (metadataSourceFile === null)) {
    throw new Error(
      "Source-ref preview requires exactly one --metadata-source or --metadata-source-file.",
    );
  }

  const source =
    metadataSourceFile !== null
      ? await readFile(metadataSourceFile, "utf8")
      : (metadataSource ?? "");
  const sourceHash = sha256(source);
  return {
    kind,
    metadataSourceRef: `${kind}:${sourceId}:${sourceHash}`,
    sha256: sourceHash,
    sourceId,
  };
}

async function parseMetadataInput(
  args: string[],
  evidence: CleanupEvidenceInput,
): Promise<{ metadata: CleanupMetadata; metadataSourceRef: string }> {
  let prBody: string | null = null;
  let prBodyFile: string | null = null;
  let metadataSource: string | null = null;
  let metadataSourceFile: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === undefined) {
      throw new Error("Unexpected missing CLI token.");
    }

    if (token === "--") {
      continue;
    }

    if (token === "--evidence-json" || token === "--evidence-json-file") {
      index += 1;
      continue;
    }

    if (token === "--preflight-plan-file") {
      index += 1;
      continue;
    }

    if (
      token === "--print-source-ref" ||
      token === "--metadata-source-kind" ||
      token === "--metadata-source-id"
    ) {
      throw new Error(
        "Source-ref preview arguments cannot be combined with cleanup validation.",
      );
    }

    if (token === "--mode" || token === "--story" || token === "--branch") {
      throw new Error(
        "Cleanup metadata must be read from a reviewed PR body or durable handoff comment source.",
      );
    }

    if (token === "--pr-body") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --pr-body.");
      }
      prBody = value;
      index += 1;
      continue;
    }

    if (token === "--pr-body-file") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --pr-body-file.");
      }
      prBodyFile = resolveCliPath(value, process.cwd());
      index += 1;
      continue;
    }

    if (token === "--metadata-source") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --metadata-source.");
      }
      metadataSource = value;
      index += 1;
      continue;
    }

    if (token === "--metadata-source-file") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --metadata-source-file.");
      }
      metadataSourceFile = resolveCliPath(value, process.cwd());
      index += 1;
      continue;
    }

    throw new Error(`Unexpected argument: ${token}`);
  }

  const inlineSources = [prBody, metadataSource].filter(
    (source) => source !== null,
  );
  const fileSources = [prBodyFile, metadataSourceFile].filter(
    (source) => source !== null,
  );

  if (inlineSources.length + fileSources.length !== 1) {
    throw new Error(
      "Missing or ambiguous cleanup metadata source: provide exactly one reviewed PR body or durable handoff comment source.",
    );
  }

  const sourceFile = prBodyFile ?? metadataSourceFile;
  const source =
    sourceFile !== null
      ? await readFile(sourceFile, "utf8")
      : (prBody ?? metadataSource ?? "");
  const sourceSha256 = sha256(source);
  if (sourceSha256 !== evidence.metadataSource.contentSha256) {
    throw new Error(
      "Cleanup metadata source content does not match reviewed PR evidence.",
    );
  }
  return {
    metadata: parseCleanupMetadataBlock(source),
    metadataSourceRef: buildSourceRef(evidence),
  };
}

function buildInputsHash(value: unknown) {
  return sha256(JSON.stringify(sortJson(value)));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortJson(entry));
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortJson(entry)]),
  );
}

async function parseEvidenceInput(
  args: string[],
): Promise<CleanupEvidenceInput> {
  let evidenceJson: string | null = null;
  let evidenceJsonFile: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === "--evidence-json") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --evidence-json.");
      }
      evidenceJson = value;
      index += 1;
      continue;
    }

    if (token === "--evidence-json-file") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --evidence-json-file.");
      }
      evidenceJsonFile = resolveCliPath(value, process.cwd());
      index += 1;
      continue;
    }
  }

  if (evidenceJson !== null && evidenceJsonFile !== null) {
    throw new Error(
      "Ambiguous evidence input: provide only one of --evidence-json or --evidence-json-file.",
    );
  }

  if (evidenceJson === null && evidenceJsonFile === null) {
    throw new Error(
      "Missing required PR evidence input: provide --evidence-json or --evidence-json-file.",
    );
  }

  const source =
    evidenceJsonFile !== null
      ? await readFile(evidenceJsonFile, "utf8")
      : (evidenceJson ?? "");

  try {
    return JSON.parse(source) as CleanupEvidenceInput;
  } catch (error) {
    throw new Error(
      `Malformed evidence JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function buildSourceRef(evidence: CleanupEvidenceInput) {
  return `${evidence.metadataSource.kind}:${evidence.metadataSource.sourceId}:${evidence.metadataSource.contentSha256}`;
}

function readTrustedHeadSha(repoRoot: string) {
  return execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
}

await main();
